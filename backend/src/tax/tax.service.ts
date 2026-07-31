import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto } from './dto/tax-preview.dto';
import { FeatureFlagsService } from '../common/config/feature-flags';
import { SimpleRegimeNotAvailableException } from '../common/exceptions/simple-regime-not-available.exception';
import {
  PersonType,
  SaleConcept,
  TaxDirection,
  TaxType,
  Prisma,
  FiscalSourceType,
  FiscalCalculationStatus,
  TaxCalculationMethod,
  FiscalRoundingMode,
  LineTaxType,
  ItemTaxTreatment,
} from '@prisma/client';
import {
  roundCalculatedFiscalAmount,
  roundFiscalRate,
  sumRoundedFiscalAmounts,
} from './fiscal-rounding';
import { createFiscalSourceFingerprint } from './fiscal-fingerprint';
import { assertSellerImpoconsumoResponsibility } from './impoconsumo-responsibility';
import { calculateLineTax } from './line-tax-calculator';
import {
  assertOrderTotalMatchesFiscalSubtotal,
  assertReservationFiscalShape,
  assertRetentionsWithinGross,
  assertZeroCommercialDiscounts,
} from './v2-fiscal-invariants';

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly featureFlags: FeatureFlagsService = {
      simpleRegimeEnabled: true,
    } as FeatureFlagsService,
  ) {}

  async calculateTaxPreview(
    businessId: string,
    dto: TaxPreviewDto,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx || this.prisma;
    const calculationMethod = await this.resolveCalculationMethod(
      db,
      businessId,
      dto,
    );
    const useLineRoundedV2 =
      calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2;
    const sellerProfile = await db.businessTaxProfile.findUnique({
      where: { businessId },
      include: {
        responsibilities: {
          include: {
            responsibility: true,
          },
        },
      },
    });

    const sellerHasSimpleResponsibility = Boolean(
      sellerProfile?.responsibilities.some((item) => item.responsibility.code === '47'),
    );
    if (
      !this.featureFlags.simpleRegimeEnabled &&
      (dto.buyerIsRegimenSimple === true || sellerHasSimpleResponsibility)
    ) {
      throw new SimpleRegimeNotAvailableException();
    }

    if (sellerProfile && sellerProfile.taxSettingsEnabled === false) {
      return await this.emptyTaxPreview(businessId, dto, {
        profileMissing: false,
        taxSettingsEnabled: false,
        taxDisabledReason: 'TAX_SETTINGS_DISABLED',
      }, tx, calculationMethod);
    }

    if (!sellerProfile) {
      this.logger.warn(
        `No tax profile configured for business ${businessId}. Returning zero tax.`,
      );
      return await this.emptyTaxPreview(businessId, dto, {
        profileMissing: true,
        taxSettingsEnabled: false,
        taxDisabledReason: 'PROFILE_MISSING',
      }, tx, calculationMethod);
    }

    const globalParams = await db.taxGlobalParameter.findFirst({
      where: { active: true },
      orderBy: { year: 'desc' },
    });
    const uvtValue = globalParams?.uvt ?? new Prisma.Decimal(52374);
    const defaultVat = globalParams?.defaultVatRate ?? new Prisma.Decimal(0.19);
    const defaultImpoconsumo =
      globalParams?.defaultImpoconsumoRate ?? new Prisma.Decimal(0.08);

    let subtotalTotal = new Prisma.Decimal(0);
    let vatBase = new Prisma.Decimal(0);
    let impoconsumoBase = new Prisma.Decimal(0);
    let vatTotal = new Prisma.Decimal(0);
    let impoconsumoTotal = new Prisma.Decimal(0);
    const taxLines: any[] = [];
    const itemBreakdown: any[] = [];

    const itemIds = dto.cartItems.map((i) => i.itemId);
    const dbItems = await db.item.findMany({
      where: { id: { in: itemIds }, businessId },
    });
    const itemsMap = new Map(dbItems.map((i) => [i.id, i]));

    const sellerResponsibilityCodes = sellerProfile.responsibilities.map(
      (r) => r.responsibility.code,
    );
    const sellerIsIvaResponsable = sellerResponsibilityCodes.includes('48');
    const sellerIsNoResponsableIva = sellerResponsibilityCodes.includes('49');
    const sellerIsRegimenSimple = sellerResponsibilityCodes.includes('47');
    const sellerIsAutorretenedor = sellerResponsibilityCodes.includes('15');
    const sellerIsGranContribuyente = sellerResponsibilityCodes.includes('13');
    const sellerIsPersonaNaturalNoResponsable =
      sellerProfile.personType === PersonType.NATURAL && sellerIsNoResponsableIva;
    const sellerIsIncomeTaxDeclarant = sellerProfile.isIncomeTaxDeclarant ?? true;
    const reteIcaRateOverridePerThousand =
      dto.reteIcaRateOverride ?? dto.icaRateOverride;

    if (sellerIsIvaResponsable && sellerIsPersonaNaturalNoResponsable) {
      throw Object.assign(new Error('Perfil de IVA del vendedor contradictorio.'), {
        code: 'INVALID_SELLER_VAT_PROFILE',
      });
    }

    if (
      dbItems.some((item) => item.appliesImpoconsumo) &&
      Object.prototype.hasOwnProperty.call(
        sellerProfile,
        'isImpoconsumoResponsible',
      )
    ) {
      assertSellerImpoconsumoResponsibility(
        true,
        sellerProfile.isImpoconsumoResponsible,
      );
    }

    // Derivación de saleConcept con control de conceptos mixtos
    const cartConcepts = Array.from(
      new Set(
        dto.cartItems
          .map((i) => {
            const dbItem = itemsMap.get(i.itemId);
            return dbItem?.saleConcept;
          })
          .filter((c): c is SaleConcept => !!c),
      ),
    );

    let hasMixedConcepts = false;
    let mixedConceptsWarning: string | null = null;
    let derivedSaleConcept: SaleConcept = dto.saleConcept ?? SaleConcept.GOODS;

    if (cartConcepts.length > 0) {
      if (cartConcepts.length > 1) {
        hasMixedConcepts = true;
        mixedConceptsWarning = `Se detectaron múltiples conceptos fiscales en la venta (${cartConcepts.join(', ')}). Se aplicará prioridad: SERVICES > HONORARIOS > ARRENDAMIENTOS > FOOD_BEVERAGES > GOODS > OTHER.`;
        
        const priorityOrder = [
          SaleConcept.SERVICES,
          SaleConcept.HONORARIOS,
          SaleConcept.ARRENDAMIENTOS,
          SaleConcept.FOOD_BEVERAGES,
          SaleConcept.GOODS,
          SaleConcept.OTHER,
        ];
        derivedSaleConcept = priorityOrder.find(c => cartConcepts.includes(c)) || SaleConcept.GOODS;
      } else {
        derivedSaleConcept = cartConcepts[0];
      }
    }

    const buyerIsPersonaNatural = dto.buyerType === PersonType.NATURAL;
    const buyerIsRetenedorOrGran =
      dto.buyerIsRetenedor || dto.buyerIsGranContribuyente;
    let impoconsumoRateUsed: Prisma.Decimal | null = null;
    const impoconsumoRatesUsed = new Set<string>();

    for (const cartItem of dto.cartItems) {
      const item = itemsMap.get(cartItem.itemId);
      if (!item) continue;

      const qty = new Prisma.Decimal(cartItem.quantity);
      const itemPrice = cartItem.unitPrice != null
        ? new Prisma.Decimal(cartItem.unitPrice)
        : new Prisma.Decimal(item.price);
      if (useLineRoundedV2) {
        const line = calculateLineTax({
          quantity: qty,
          unitPrice: itemPrice,
          discountRate: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          taxTreatment: item.taxTreatment ?? ItemTaxTreatment.TAXED,
          vatRate: item.vatRate ?? null,
          globalVatRate: defaultVat,
          appliesImpoconsumo: item.appliesImpoconsumo,
          impoconsumoRate: item.impoconsumoRate ?? null,
          globalImpoconsumoRate: defaultImpoconsumo,
          sellerIsVatResponsible: sellerIsIvaResponsable,
          sellerIsNaturalNonVatResponsible:
            sellerIsPersonaNaturalNoResponsable,
        });
        subtotalTotal = subtotalTotal.add(line.baseAmount);
        if (line.taxType === LineTaxType.VAT) {
          vatBase = vatBase.add(line.baseAmount);
          vatTotal = vatTotal.add(line.taxAmount);
        } else if (line.taxType === LineTaxType.IMPOCONSUMO) {
          impoconsumoBase = impoconsumoBase.add(line.baseAmount);
          impoconsumoTotal = impoconsumoTotal.add(line.taxAmount);
          impoconsumoRatesUsed.add(line.taxRate.toFixed(4));
          impoconsumoRateUsed =
            impoconsumoRatesUsed.size === 1 ? line.taxRate : null;
        }
        itemBreakdown.push({
          sourceLineKey: cartItem.sourceLineKey ?? cartItem.itemId,
          itemId: item.id,
          fiscalCode: item.fiscalCode ?? item.id,
          name: item.name,
          quantity: qty,
          unitPriceNet: itemPrice,
          discountRate: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          unitMeasureCode: item.unitMeasureCode,
          standardCode: item.standardCode,
          saleConcept: item.saleConcept,
          ...line,
        });
        continue;
      }

      const itemSubtotal = itemPrice.mul(qty);
      subtotalTotal = subtotalTotal.add(itemSubtotal);

      if (sellerIsPersonaNaturalNoResponsable) {
        continue;
      }

      if (item.appliesImpoconsumo) {
        const rate =
          item.impoconsumoRate ?? defaultImpoconsumo ?? new Prisma.Decimal(0.08);
        impoconsumoRatesUsed.add(new Prisma.Decimal(rate).toFixed(4));
        impoconsumoRateUsed =
          impoconsumoRatesUsed.size === 1 ? new Prisma.Decimal(rate) : null;
        impoconsumoBase = impoconsumoBase.add(itemSubtotal);
        impoconsumoTotal = impoconsumoTotal.add(itemSubtotal.mul(rate));
        continue;
      }

      if (sellerIsIvaResponsable) {
        vatBase = vatBase.add(itemSubtotal);
        vatTotal = vatTotal.add(itemSubtotal.mul(defaultVat));
      }
    }

    if (useLineRoundedV2) {
      const grouped = new Map<string, any>();
      for (const line of itemBreakdown) {
        const mappedTaxType =
          line.taxType === LineTaxType.VAT
            ? TaxType.IVA
            : line.taxType === LineTaxType.IMPOCONSUMO
              ? TaxType.IMPOCONSUMO
              : TaxType[line.taxType as keyof typeof TaxType];
        const key = [
          mappedTaxType,
          line.taxRate.toString(),
          line.taxTreatment,
          line.saleConcept,
        ].join('|');
        const existingLine = grouped.get(key);
        if (existingLine) {
          existingLine.baseAmount = existingLine.baseAmount.add(
            line.baseAmount,
          );
          existingLine.taxAmount = existingLine.taxAmount.add(
            line.taxAmount,
          );
        } else {
          grouped.set(key, {
            taxType: mappedTaxType,
            direction: TaxDirection.CHARGE,
            taxTreatment: line.taxTreatment,
            baseAmount: line.baseAmount,
            rate: line.taxRate,
            taxAmount: line.taxAmount,
            saleConcept: line.saleConcept,
            accountCode:
              mappedTaxType === TaxType.IVA
                ? '2408'
                : mappedTaxType === TaxType.IMPOCONSUMO
                  ? '519595'
                  : 'INFORMATIONAL',
            applied:
              mappedTaxType === TaxType.IVA ||
              mappedTaxType === TaxType.IMPOCONSUMO,
            informational:
              mappedTaxType !== TaxType.IVA &&
              mappedTaxType !== TaxType.IMPOCONSUMO,
            reason: 'Resultado oficial LINE_ROUNDED_V2 agrupado por línea.',
          });
        }
      }
      taxLines.push(...grouped.values());
    } else if (vatTotal.gt(0)) {
      taxLines.push({
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        baseAmount: vatBase,
        rate: defaultVat,
        taxAmount: vatTotal,
        accountCode: '2408',
        applied: true,
        reason: 'El vendedor es Responsable de IVA (48) y el item no aplica Impoconsumo.',
      });
    } else if (sellerIsIvaResponsable || sellerIsPersonaNaturalNoResponsable) {
      taxLines.push({
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        baseAmount: vatBase,
        rate: defaultVat,
        taxAmount: new Prisma.Decimal(0),
        accountCode: '2408',
        applied: false,
        reason: sellerIsPersonaNaturalNoResponsable
          ? 'Persona Natural No Responsable: no genera IVA.'
          : 'No hay base gravada con IVA.',
      });
    }

    if (!useLineRoundedV2 && impoconsumoTotal.gt(0)) {
      taxLines.push({
        taxType: TaxType.IMPOCONSUMO,
        direction: TaxDirection.CHARGE,
        baseAmount: impoconsumoBase,
        rate: impoconsumoRateUsed ?? defaultImpoconsumo ?? new Prisma.Decimal(0.08),
        taxAmount: impoconsumoTotal,
        accountCode: '519595',
        applied: true,
        reason: 'Aplica Impoconsumo sobre items configurados individualmente.',
      });
    }

    if (useLineRoundedV2) {
      subtotalTotal = sumRoundedFiscalAmounts(
        itemBreakdown.map((line) => line.baseAmount),
      );
      vatTotal = sumRoundedFiscalAmounts(
        itemBreakdown
          .filter((line) => line.taxType === LineTaxType.VAT)
          .map((line) => line.taxAmount),
      );
      impoconsumoTotal = sumRoundedFiscalAmounts(
        itemBreakdown
          .filter((line) => line.taxType === LineTaxType.IMPOCONSUMO)
          .map((line) => line.taxAmount),
      );
    }

    const rules = await db.salesTaxRule.findMany({
      where: { businessId, active: true },
    });

    const findRule = (taxType: TaxType, direction: TaxDirection) => {
      const specificRule = rules.find(
        (r) =>
          r.taxType === taxType &&
          r.direction === direction &&
          r.saleConcept === derivedSaleConcept,
      );
      if (specificRule) return specificRule;
      return rules.find(
        (r) => r.taxType === taxType && r.direction === direction && !r.saleConcept,
      );
    };

    const reteFuenteRule = findRule(TaxType.RETEFUENTE, TaxDirection.WITHHOLD);
    const reteIvaRule = findRule(TaxType.RETEIVA, TaxDirection.WITHHOLD);
    const autoRetencionRule = findRule(
      TaxType.AUTORRETENCION,
      TaxDirection.SELF,
    );

    const getReteFuenteDefaults = () => {
      switch (derivedSaleConcept) {
        case SaleConcept.SERVICES:
          return {
            minBaseUvt: new Prisma.Decimal(15),
            rate: new Prisma.Decimal(sellerIsIncomeTaxDeclarant ? 0.04 : 0.06),
          };
        case SaleConcept.HONORARIOS:
          return {
            minBaseUvt: new Prisma.Decimal(0),
            rate: new Prisma.Decimal(sellerIsIncomeTaxDeclarant ? 0.11 : 0.1),
          };
        case SaleConcept.ARRENDAMIENTOS:
          return {
            minBaseUvt: new Prisma.Decimal(27),
            rate: new Prisma.Decimal(0.035),
          };
        case SaleConcept.GOODS:
        default:
          return {
            minBaseUvt: new Prisma.Decimal(10),
            rate: new Prisma.Decimal(
              sellerIsIncomeTaxDeclarant ? 0.025 : 0.035,
            ),
          };
      }
    };

    const reteFuenteDefaults = getReteFuenteDefaults();
    const reteFuenteMinBaseUvt =
      reteFuenteRule?.minBaseUvt ?? reteFuenteDefaults.minBaseUvt;
    const reteFuenteRate = reteFuenteRule?.rate ?? reteFuenteDefaults.rate;

    let reteFuenteTotal = new Prisma.Decimal(0);
    let reteIvaTotal = new Prisma.Decimal(0);
    let reteIcaTotal = new Prisma.Decimal(0);

    if (
      // Simulador_Ventas applies ReteFuente to a juridical buyer.  Gran
      // Contribuyente is relevant for ReteIVA, but it is not a prerequisite
      // for ReteFuente (nor is the buyer's Autorretenedor flag an exclusion).
      !buyerIsPersonaNatural &&
      !dto.buyerIsRegimenSimple &&
      !sellerIsRegimenSimple &&
      !sellerIsAutorretenedor
    ) {
      const minBaseCop = reteFuenteMinBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        reteFuenteTotal = subtotalTotal.mul(reteFuenteRate);
        taxLines.push({
          taxType: TaxType.RETEFUENTE,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate: reteFuenteRate,
          taxAmount: reteFuenteTotal,
          accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
          applied: true,
          reason: `Comprador juridico practica ReteFuente y la base alcanza ${reteFuenteMinBaseUvt} UVT.`,
        });
      } else {
        taxLines.push({
          taxType: TaxType.RETEFUENTE,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate: reteFuenteRate,
          taxAmount: new Prisma.Decimal(0),
          accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
          applied: false,
          reason: `Venta no alcanza la base minima de retencion de ${reteFuenteMinBaseUvt} UVT.`,
        });
      }
    } else {
      taxLines.push({
        taxType: TaxType.RETEFUENTE,
        direction: TaxDirection.WITHHOLD,
        baseAmount: subtotalTotal,
        rate: reteFuenteRate,
        taxAmount: new Prisma.Decimal(0),
        accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
        applied: false,
        reason: sellerIsAutorretenedor
          ? 'El vendedor es autorretenedor; no se practica ReteFuente.'
          : sellerIsRegimenSimple
            ? 'El vendedor pertenece al Regimen Simple (47) y esta exento de ReteFuente.'
            : dto.buyerIsRegimenSimple
              ? 'El comprador pertenece al Regimen Simple (RST); no practica ReteFuente.'
              : buyerIsPersonaNatural
                ? 'El comprador es Persona Natural; no practica ReteFuente.'
                : 'No se cumplen las condiciones fiscales para practicar ReteFuente.',
      });
    }

    const reteIvaRate = reteIvaRule?.rate ?? new Prisma.Decimal(0.15);
    if (
      dto.buyerIsGranContribuyente &&
      vatTotal.gt(0) &&
      !sellerIsRegimenSimple &&
      !sellerIsGranContribuyente
    ) {
      reteIvaTotal = vatTotal.mul(reteIvaRate);
      taxLines.push({
        taxType: TaxType.RETEIVA,
        direction: TaxDirection.WITHHOLD,
        baseAmount: vatTotal,
        rate: reteIvaRate,
        taxAmount: reteIvaTotal,
        accountCode: reteIvaRule?.pucAccountCode ?? '135517',
        applied: true,
        reason: 'Comprador Gran Contribuyente retiene el 15% del IVA generado.',
      });
    } else {
      taxLines.push({
        taxType: TaxType.RETEIVA,
        direction: TaxDirection.WITHHOLD,
        baseAmount: vatTotal,
        rate: reteIvaRate,
        taxAmount: new Prisma.Decimal(0),
        accountCode: reteIvaRule?.pucAccountCode ?? '135517',
        applied: false,
        reason: 'No se cumplen las condiciones para retencion de IVA.',
      });
    }

    let reteIcaRate = new Prisma.Decimal(0);
    let useReteIca = false;

    // Determinar la tarifa de ReteICA y si aplica
    if (reteIcaRateOverridePerThousand !== undefined && reteIcaRateOverridePerThousand !== null) {
      reteIcaRate = new Prisma.Decimal(reteIcaRateOverridePerThousand).div(1000);
      if (reteIcaRate.gt(0) && !dto.buyerIsRegimenSimple) {
        useReteIca = true;
      }
    } else {
      if (sellerProfile.personType === PersonType.NATURAL) {
        reteIcaRate = new Prisma.Decimal(0);
      } else {
        const sellerCiiuCode = sellerProfile.mainCiiuCode?.trim();
        let icaRateObj = null;
        if (sellerCiiuCode && dto.fiscalMunicipalityCode) {
          icaRateObj = await db.municipalityIcaRate.findFirst({
            where: {
              businessId,
              municipalityCode: dto.fiscalMunicipalityCode,
              ciiuCode: sellerCiiuCode,
              active: true,
            },
          });
        }
        if (!icaRateObj && dto.fiscalMunicipalityCode) {
          icaRateObj = await db.municipalityIcaRate.findFirst({
            where: {
              businessId,
              municipalityCode: dto.fiscalMunicipalityCode,
              active: true,
            },
          });
        }
        reteIcaRate = icaRateObj?.reteIcaRate ?? new Prisma.Decimal(0.00966);
      }

      if (
        buyerIsRetenedorOrGran &&
        !buyerIsPersonaNatural &&
        !dto.buyerIsRegimenSimple &&
        !sellerIsRegimenSimple &&
        !sellerIsGranContribuyente &&
        dto.fiscalMunicipalityCode
      ) {
        useReteIca = true;
      }
    }

    if (useReteIca) {
      let minBaseUvt = new Prisma.Decimal(0);
      let icaRateObj = null;

      if (reteIcaRateOverridePerThousand === undefined || reteIcaRateOverridePerThousand === null) {
        const sellerCiiuCode = sellerProfile.mainCiiuCode?.trim();
        if (sellerCiiuCode && dto.fiscalMunicipalityCode) {
          icaRateObj = await db.municipalityIcaRate.findFirst({
            where: {
              businessId,
              municipalityCode: dto.fiscalMunicipalityCode,
              ciiuCode: sellerCiiuCode,
              active: true,
            },
          });
        }
        if (!icaRateObj && dto.fiscalMunicipalityCode) {
          icaRateObj = await db.municipalityIcaRate.findFirst({
            where: {
              businessId,
              municipalityCode: dto.fiscalMunicipalityCode,
              active: true,
            },
          });
        }
        minBaseUvt = icaRateObj?.minBaseUvt ?? new Prisma.Decimal(0);
      }

      const minBaseCop = minBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        reteIcaTotal = subtotalTotal.mul(reteIcaRate);
        taxLines.push({
          taxType: TaxType.RETEICA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate: reteIcaRate,
          taxAmount: reteIcaTotal,
          accountCode: '135518',
          applied: true,
          reason: reteIcaRateOverridePerThousand !== undefined && reteIcaRateOverridePerThousand !== null
            ? `Tarifa ReteICA modificada manualmente a ${reteIcaRateOverridePerThousand} por mil.`
            : icaRateObj
              ? `Comprador retiene ICA para el municipio ${dto.fiscalMunicipalityCode} y la base supera ${minBaseUvt} UVT.`
              : `Fallback funcional Simulador_Ventas: ReteICA 9.66 por mil para el municipio ${dto.fiscalMunicipalityCode ?? 'N/A'}.`,
        });
      } else {
        taxLines.push({
          taxType: TaxType.RETEICA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate: reteIcaRate,
          taxAmount: new Prisma.Decimal(0),
          accountCode: '135518',
          applied: false,
          reason: `Venta no alcanza la base minima de ICA de ${minBaseUvt} UVT para este municipio.`,
        });
      }
    } else {
      taxLines.push({
        taxType: TaxType.RETEICA,
        direction: TaxDirection.WITHHOLD,
        baseAmount: subtotalTotal,
        rate: reteIcaRate,
        taxAmount: new Prisma.Decimal(0),
        accountCode: '135518',
        applied: false,
        reason: reteIcaRateOverridePerThousand !== undefined && reteIcaRateOverridePerThousand !== null
          ? 'Tarifa ReteICA configurada en 0 por mil.'
          : sellerIsGranContribuyente
            ? 'El vendedor es Gran Contribuyente; no aplica ReteICA.'
            : sellerIsRegimenSimple
              ? 'El vendedor pertenece al Regimen Simple (47) y esta exento de ReteICA.'
              : dto.buyerIsRegimenSimple
                ? 'El comprador pertenece al Regimen Simple (RST); no practica ReteICA.'
                : buyerIsPersonaNatural
                  ? 'El comprador es Persona Natural; no practica ReteICA.'
                  : 'Falta configurar municipio fiscal del comprador o este no es retenedor.',
      });
    }

    let autoRetencionTotal = new Prisma.Decimal(0);
    if (sellerIsAutorretenedor) {
      const minBaseUvt = autoRetencionRule?.minBaseUvt ?? new Prisma.Decimal(0);
      const minBaseCop = minBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        autoRetencionTotal = subtotalTotal.mul(reteFuenteRate);
        taxLines.push({
          taxType: TaxType.AUTORRETENCION,
          direction: TaxDirection.SELF,
          baseAmount: subtotalTotal,
          rate: reteFuenteRate,
          taxAmount: autoRetencionTotal,
          accountCode: autoRetencionRule?.pucAccountCode ?? '236575',
          applied: true,
          reason:
            'El vendedor es autorretenedor; autorretencion calculada con la tarifa de ReteFuente del concepto.',
        });
      }
    }

    if (useLineRoundedV2) {
      reteFuenteTotal = roundCalculatedFiscalAmount(reteFuenteTotal);
      reteIvaTotal = roundCalculatedFiscalAmount(reteIvaTotal);
      reteIcaTotal = roundCalculatedFiscalAmount(reteIcaTotal);
      autoRetencionTotal = roundCalculatedFiscalAmount(autoRetencionTotal);
      for (const line of taxLines) {
        if (
          line.direction !== TaxDirection.CHARGE &&
          line.applied === true
        ) {
          line.baseAmount =
            line.taxType === TaxType.RETEIVA ? vatTotal : subtotalTotal;
          line.taxAmount =
            line.taxType === TaxType.RETEFUENTE
              ? reteFuenteTotal
              : line.taxType === TaxType.RETEIVA
                ? reteIvaTotal
                : line.taxType === TaxType.RETEICA
                  ? reteIcaTotal
                  : autoRetencionTotal;
        }
      }
    }

    const grossFiscalTotal = useLineRoundedV2
      ? sumRoundedFiscalAmounts([
          subtotalTotal,
          vatTotal,
          impoconsumoTotal,
        ])
      : subtotalTotal.add(vatTotal).add(impoconsumoTotal);
    const buyerRetentions = useLineRoundedV2
      ? assertRetentionsWithinGross({
          grossFiscalTotal,
          withholdingTax: reteFuenteTotal,
          vatWithholding: reteIvaTotal,
          icaWithholding: reteIcaTotal,
        })
      : reteFuenteTotal.add(reteIvaTotal).add(reteIcaTotal);

    let netReceived = grossFiscalTotal.sub(buyerRetentions);

    if (netReceived.lt(0)) {
      netReceived = new Prisma.Decimal(0);
    }

    const sourceFingerprint = createFiscalSourceFingerprint({
      sourceType: dto.sourceType ?? 'SALE_PREVIEW',
      sourceId: dto.sourceId ?? null,
      businessId,
      lines: dto.cartItems.map((cartItem) => {
        const item = itemsMap.get(cartItem.itemId);
        return {
           id: cartItem.sourceLineKey ?? cartItem.itemId,
          quantity: cartItem.quantity,
          unitPrice: cartItem.unitPrice ?? item?.price ?? null,
          saleConcept: item?.saleConcept ?? null,
          taxTreatment: item?.taxTreatment ?? null,
          vatRate: item?.vatRate ?? null,
          appliesImpoconsumo: item?.appliesImpoconsumo ?? false,
          impoconsumoRate: item?.impoconsumoRate ?? null,
        };
      }),
      buyer: {
        buyerType: dto.buyerType,
        buyerDocumentType: dto.buyerDocumentType,
        buyerDocumentNumber: dto.buyerDocumentNumber,
        buyerIsIvaResponsable: dto.buyerIsIvaResponsable,
        buyerIsRetenedor: dto.buyerIsRetenedor,
        buyerIsGranContribuyente: dto.buyerIsGranContribuyente,
        buyerIsAutorretenedor: dto.buyerIsAutorretenedor,
        buyerIsRegimenSimple: dto.buyerIsRegimenSimple,
        fiscalMunicipalityCode: dto.fiscalMunicipalityCode,
      },
      fiscal: {
        saleConcept: derivedSaleConcept,
        reteIcaRateOverride: reteIcaRateOverridePerThousand,
        defaultVat,
        defaultImpoconsumo,
        uvtValue,
        taxYear: globalParams?.year ?? new Date().getFullYear(),
        sellerPersonType: sellerProfile.personType,
        sellerResponsibilities: sellerResponsibilityCodes.slice().sort(),
        sellerIsIncomeTaxDeclarant,
        sellerIsImpoconsumoResponsible:
          sellerProfile.isImpoconsumoResponsible,
        rules: rules.map((rule) => ({
          id: rule.id,
          taxType: rule.taxType,
          direction: rule.direction,
          saleConcept: rule.saleConcept,
          rate: rule.rate,
          minBaseUvt: rule.minBaseUvt,
          active: rule.active,
        })),
      },
      calculationMethod,
      taxEngineVersion: useLineRoundedV2
        ? 'line-rounded-v2'
        : 'aggregate-v1',
    });

    return {
      subtotal: subtotalTotal,
      vatTotal,
      impoconsumoTotal,
      reteFuenteTotal,
      reteIvaTotal,
      reteIcaTotal,
      autoRetencionTotal,
      netReceived,
      grossFiscalTotal,
      taxLines,
      itemBreakdown,
      uvtValue,
      taxYear: globalParams?.year ?? new Date().getFullYear(),
      saleConceptUsed: derivedSaleConcept,
      reteIcaRateUsed: reteIcaRate,
      reteIcaRateOverrideUsed:
        reteIcaRateOverridePerThousand !== undefined && reteIcaRateOverridePerThousand !== null
          ? new Prisma.Decimal(reteIcaRateOverridePerThousand).div(1000)
          : null,
      impoconsumoRateUsed,
      sellerIsSimpleRegime: sellerIsRegimenSimple,
      sellerIsIncomeTaxDeclarant,
      hasMixedConcepts,
      mixedConceptsWarning,
      profileMissing: false,
      taxSettingsEnabled: true,
      taxDisabledReason: null,
      sourceFingerprint,
      calculationMethod,
      taxEngineVersion: useLineRoundedV2
        ? 'line-rounded-v2'
        : 'aggregate-v1',
      roundingMode: useLineRoundedV2
        ? FiscalRoundingMode.ROUND_HALF_UP
        : FiscalRoundingMode.DATABASE_DEFAULT,
      roundingScale: 2,
    };
  }

  async freezeTaxCalculation(
    tx: Prisma.TransactionClient,
    source:
      | string
      | {
          sourceType: FiscalSourceType;
          sourceId: string;
          businessId: string;
        },
    preview: any,
    buyerData: any,
  ) {
    const normalizedSource =
      typeof source === 'string'
        ? {
            sourceType: FiscalSourceType.ORDER,
            sourceId: source,
            businessId: '',
          }
        : source;
    const sourceRecord =
      normalizedSource.sourceType === FiscalSourceType.ORDER
        ? await tx.order.findUnique({
            where: { id: normalizedSource.sourceId },
            include: {
              items: { include: { item: true } },
              business: {
                include: {
                  taxProfile: {
                    include: {
                      responsibilities: { include: { responsibility: true } },
                    },
                  },
                },
              },
            },
          })
        : await tx.reservation.findUnique({
            where: { id: normalizedSource.sourceId },
            include: {
              item: true,
              business: {
                include: {
                  taxProfile: {
                    include: {
                      responsibilities: { include: { responsibility: true } },
                    },
                  },
                },
              },
            },
          });

    if (!sourceRecord) throw new NotFoundException('Fuente de venta no encontrada');
    const businessId = normalizedSource.businessId || sourceRecord.businessId;
    if (businessId !== sourceRecord.businessId) {
      throw new NotFoundException('Fuente de venta no encontrada');
    }

    const uniqueWhere =
      normalizedSource.sourceType === FiscalSourceType.ORDER
        ? { orderId: normalizedSource.sourceId }
        : { reservationId: normalizedSource.sourceId };
    const sellerProfile = sourceRecord.business.taxProfile;
    const sellerPersonType = sellerProfile?.personType || null;
    const sellerIsSimpleRegime = sellerProfile
      ? sellerProfile.responsibilities.some(
          (responsibility) =>
            responsibility.responsibility.code === '47',
        )
      : false;
    const sellerIsIncomeTaxDeclarant =
      sellerProfile?.isIncomeTaxDeclarant ?? true;
    const sellerFiscalSnapshot = sellerProfile
      ? {
          tradeName: sellerProfile.tradeName,
          nit: sellerProfile.nit,
          dv: sellerProfile.dv,
          address: sellerProfile.address,
          municipalityCode: sellerProfile.municipalityCode,
          isIncomeTaxDeclarant: sellerProfile.isIncomeTaxDeclarant,
          personType: sellerProfile.personType,
          responsibilities: sellerProfile.responsibilities.map(
            (responsibility) => responsibility.responsibility.code,
          ),
        }
      : {};
    const chargedTaxTotal = new Prisma.Decimal(preview.vatTotal).add(
      new Prisma.Decimal(preview.impoconsumoTotal),
    );
    const withheldTaxTotal = new Prisma.Decimal(preview.reteFuenteTotal)
      .add(new Prisma.Decimal(preview.reteIvaTotal))
      .add(new Prisma.Decimal(preview.reteIcaTotal));
    if (!(tx as any).saleFiscalContext) {
      await (tx as any).orderFiscalContext.upsert({
        where: { orderId: normalizedSource.sourceId },
        update: {
          ...buyerData,
          subtotal: preview.subtotal,
          chargedTaxTotal,
          withheldTaxTotal,
          netReceived: preview.netReceived,
          saleConcept: preview.saleConceptUsed,
        },
        create: {
          orderId: normalizedSource.sourceId,
          ...buyerData,
          subtotal: preview.subtotal,
          chargedTaxTotal,
          withheldTaxTotal,
          netReceived: preview.netReceived,
          saleConcept: preview.saleConceptUsed,
        },
      });
      await (tx as any).saleTaxLine.deleteMany({
        where: { orderId: normalizedSource.sourceId },
      });
      await (tx as any).saleTaxLine.createMany({
        data: preview.taxLines.map((line: any) => ({
          orderId: normalizedSource.sourceId,
          ...line,
        })),
      });
      await (tx as any).taxCalculationSnapshot.upsert({
        where: { orderId: normalizedSource.sourceId },
        update: {
          uvtValue: preview.uvtValue,
          sellerFiscal: sellerFiscalSnapshot,
          buyerFiscal: buyerData,
          rawCalculation: {
            ...preview,
            allLines: preview.taxLines,
          },
        },
        create: {
          orderId: normalizedSource.sourceId,
          uvtValue: preview.uvtValue,
          sellerFiscal: sellerFiscalSnapshot,
          buyerFiscal: buyerData,
          rawCalculation: {
            ...preview,
            allLines: preview.taxLines,
          },
        },
      });
      return (tx as any).orderFiscalContext.findUnique({
        where: { orderId: normalizedSource.sourceId },
      });
    }
    const existing = await tx.saleFiscalContext.findUnique({
      where: uniqueWhere,
    });
    if (existing?.calculationStatus === FiscalCalculationStatus.LOCKED) {
      throw Object.assign(
        new Error('El contexto fiscal confirmado es inmutable.'),
        { code: 'FISCAL_CONTEXT_LOCKED' },
      );
    }

    const now = new Date();
    const subtotal = roundCalculatedFiscalAmount(preview.subtotal);
    const chargedTaxTotalRounded =
      roundCalculatedFiscalAmount(chargedTaxTotal);
    const withheldTaxTotalRounded =
      roundCalculatedFiscalAmount(withheldTaxTotal);
    const netReceived = roundCalculatedFiscalAmount(preview.netReceived);
    const calculationMethod =
      preview.calculationMethod ?? TaxCalculationMethod.LINE_ROUNDED_V2;
    const roundingMode =
      calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
        ? FiscalRoundingMode.ROUND_HALF_UP
        : FiscalRoundingMode.DATABASE_DEFAULT;
    const taxEngineVersion =
      calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
        ? 'line-rounded-v2'
        : 'aggregate-v1';
    if (
      existing &&
      existing.calculationMethod !== calculationMethod
    ) {
      throw Object.assign(
        new Error('El método fiscal persistido no puede cambiar.'),
        { code: 'FISCAL_CALCULATION_METHOD_MISMATCH' },
      );
    }
    const commonData = {
      businessId,
      sourceType: normalizedSource.sourceType,
      buyerType: buyerData.buyerType,
      buyerName: buyerData.buyerName,
      buyerDocumentType: buyerData.buyerDocumentType,
      buyerDocumentNumber: buyerData.buyerDocumentNumber,
      buyerEmail: buyerData.buyerEmail,
      buyerDv: buyerData.buyerDv,
      buyerAddress: buyerData.buyerAddress,
      buyerPhone: buyerData.buyerPhone,
      buyerCountryCode: buyerData.buyerCountryCode,
      buyerMunicipalityCode: buyerData.buyerMunicipalityCode,
      buyerTributeCode: buyerData.buyerTributeCode,
      buyerIsFinalConsumer: buyerData.buyerIsFinalConsumer ?? false,
      buyerIsIvaResponsable: buyerData.buyerIsIvaResponsable ?? false,
      buyerIsRetenedor: buyerData.buyerIsRetenedor ?? false,
      buyerIsGranContribuyente: buyerData.buyerIsGranContribuyente ?? false,
      buyerIsAutorretenedor: buyerData.buyerIsAutorretenedor ?? false,
      buyerIsRegimenSimple: buyerData.buyerIsRegimenSimple ?? false,
      buyerRequiresElectronicInvoice:
        buyerData.buyerRequiresElectronicInvoice ?? false,
      fiscalMunicipalityCode: buyerData.fiscalMunicipalityCode,
      saleConcept: preview.saleConceptUsed,
      subtotal,
      chargedTaxTotal: chargedTaxTotalRounded,
      withheldTaxTotal: withheldTaxTotalRounded,
      netReceived,
      grossFiscalTotal:
        calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
          ? roundCalculatedFiscalAmount(preview.grossFiscalTotal)
          : null,
      sellerPersonType,
      sellerIsSimpleRegime,
      sellerIsIncomeTaxDeclarant,
      icaRateUsed: null,
      reteIcaRateUsed: preview.reteIcaRateUsed,
      reteIcaRateOverride: preview.reteIcaRateOverrideUsed,
      hasMixedConcepts: preview.hasMixedConcepts ?? false,
      mixedConceptsWarning: preview.mixedConceptsWarning,
      impoconsumoRateUsed: preview.impoconsumoRateUsed,
      taxYear: preview.taxYear,
      uvtValue: preview.uvtValue,
      calculationMethod,
      taxEngineVersion,
      roundingMode,
      roundingScale: 2,
      calculationStatus: FiscalCalculationStatus.CURRENT,
      sourceFingerprint: preview.sourceFingerprint ?? null,
      calculatedAt: now,
      invalidatedAt: null,
      invalidationReason: null,
    };

    const context = await tx.saleFiscalContext.upsert({
      where: uniqueWhere,
      update: {
        ...commonData,
        calculationMethod: undefined,
        taxEngineVersion: undefined,
        roundingMode: undefined,
        roundingScale: undefined,
      },
      create: {
        ...commonData,
        orderId:
          normalizedSource.sourceType === FiscalSourceType.ORDER
            ? normalizedSource.sourceId
            : null,
        reservationId:
          normalizedSource.sourceType === FiscalSourceType.RESERVATION
            ? normalizedSource.sourceId
            : null,
      },
    });

    if (context.calculationMethod !== calculationMethod) {
      throw Object.assign(
        new Error('El método fiscal persistido no puede cambiar.'),
        { code: 'FISCAL_CALCULATION_METHOD_MISMATCH' },
      );
    }

    await tx.saleTaxLine.deleteMany({
      where: { fiscalContextId: context.id, isReversal: false },
    });

    if (preview.taxLines.length > 0) {
      await tx.saleTaxLine.createMany({
        data: preview.taxLines.map((l: any) => ({
          fiscalContextId: context.id,
          taxType: l.taxType,
          direction: l.direction,
          taxableBase: roundCalculatedFiscalAmount(l.baseAmount),
          rate: roundFiscalRate(l.rate),
          taxAmount: roundCalculatedFiscalAmount(l.taxAmount),
          taxTreatment: l.taxTreatment ?? null,
          saleConcept: l.saleConcept ?? preview.saleConceptUsed,
          calculationMethod,
          roundingMode,
          roundingScale: 2,
          accountCode: l.accountCode,
          applied: l.applied,
          reason: l.reason,
        })),
      });
    }

    const lineSnapshotIds: string[] = [];
    if (calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2) {
      const breakdown = preview.itemBreakdown ?? [];
      assertZeroCommercialDiscounts(breakdown);

      if (normalizedSource.sourceType === FiscalSourceType.ORDER) {
        assertOrderTotalMatchesFiscalSubtotal(
          (sourceRecord as any).total,
          subtotal,
        );
      } else {
        assertReservationFiscalShape({
          lineCount: breakdown.length,
          quantity: breakdown[0]?.quantity ?? 0,
          unitPriceSnapshot: (sourceRecord as any).unitPriceSnapshot,
          fiscalSubtotal: subtotal,
        });
      }

      await tx.saleItemFiscalSnapshot.deleteMany({
        where: { fiscalContextId: context.id },
      });
      for (const line of breakdown) {
        const sourceLineKey =
          normalizedSource.sourceType === FiscalSourceType.ORDER
            ? String(line.sourceLineKey)
            : `reservation:${normalizedSource.sourceId}`;
        const orderItem =
          normalizedSource.sourceType === FiscalSourceType.ORDER
            ? (sourceRecord as any).items?.find(
                (candidate: any) => candidate.id === sourceLineKey,
              )
            : null;
        if (
          normalizedSource.sourceType === FiscalSourceType.ORDER &&
          !orderItem
        ) {
          throw Object.assign(
            new Error('La línea fiscal no pertenece a la orden.'),
            { code: 'FISCAL_SNAPSHOT_SOURCE_MISMATCH' },
          );
        }
        const snapshot = await tx.saleItemFiscalSnapshot.create({
          data: {
            businessId,
            fiscalContextId: context.id,
            sourceLineKey,
            orderItemId: orderItem?.id ?? null,
            reservationId:
              normalizedSource.sourceType === FiscalSourceType.RESERVATION
                ? normalizedSource.sourceId
                : null,
            itemId: line.itemId ?? null,
            fiscalCode: line.fiscalCode,
            name: line.name,
            quantity: line.quantity,
            unitPriceNet: line.unitPriceNet,
            discountRate: 0,
            discountAmount: 0,
            unitMeasureCode: line.unitMeasureCode,
            standardCode: line.standardCode,
            taxTreatment: line.taxTreatment,
            taxType: line.taxType,
            taxRate: roundFiscalRate(line.taxRate),
            taxableBase: roundCalculatedFiscalAmount(line.baseAmount),
            taxAmount: roundCalculatedFiscalAmount(line.taxAmount),
            grossAmount: roundCalculatedFiscalAmount(line.grossAmount),
            saleConcept: line.saleConcept,
            calculationMethod,
            roundingMode,
            roundingScale: 2,
            taxEngineVersion,
          },
          select: { id: true },
        });
        lineSnapshotIds.push(snapshot.id);
      }
    }

    await tx.taxCalculationSnapshot.upsert({
      where: { fiscalContextId: context.id },
      update: {
        uvtValue: preview.uvtValue,
        sellerFiscal: sellerFiscalSnapshot,
        buyerFiscal: buyerData,
        rawCalculation: {
          subtotal: preview.subtotal,
          vatTotal: preview.vatTotal,
          impoconsumoTotal: preview.impoconsumoTotal,
          grossFiscalTotal: preview.grossFiscalTotal,
          reteFuenteTotal: preview.reteFuenteTotal,
          reteIvaTotal: preview.reteIvaTotal,
          reteIcaTotal: preview.reteIcaTotal,
          autoRetencionTotal: preview.autoRetencionTotal,
          netReceived: preview.netReceived,
          allLines: preview.taxLines,
          saleConceptUsed: preview.saleConceptUsed,
          hasMixedConcepts: preview.hasMixedConcepts ?? false,
          mixedConceptsWarning: preview.mixedConceptsWarning,
          sellerPersonType,
          sellerIsSimpleRegime,
          sellerIsIncomeTaxDeclarant,
          icaRateUsed: null,
          reteIcaRateUsed: preview.reteIcaRateUsed,
          reteIcaRateOverride: preview.reteIcaRateOverrideUsed,
          impoconsumoRateUsed: preview.impoconsumoRateUsed,
          taxYear: preview.taxYear,
        },
        calculationMethod,
        taxEngineVersion,
        roundingMode,
        roundingScale: 2,
        sourceFingerprint: preview.sourceFingerprint ?? null,
        calculatedAt: now,
        lineSnapshotIds,
      },
      create: {
        fiscalContextId: context.id,
        uvtValue: preview.uvtValue,
        sellerFiscal: sellerFiscalSnapshot,
        buyerFiscal: buyerData,
        rawCalculation: {
          subtotal: preview.subtotal,
          vatTotal: preview.vatTotal,
          impoconsumoTotal: preview.impoconsumoTotal,
          grossFiscalTotal: preview.grossFiscalTotal,
          reteFuenteTotal: preview.reteFuenteTotal,
          reteIvaTotal: preview.reteIvaTotal,
          reteIcaTotal: preview.reteIcaTotal,
          autoRetencionTotal: preview.autoRetencionTotal,
          netReceived: preview.netReceived,
          allLines: preview.taxLines,
          saleConceptUsed: preview.saleConceptUsed,
          hasMixedConcepts: preview.hasMixedConcepts ?? false,
          mixedConceptsWarning: preview.mixedConceptsWarning,
          sellerPersonType,
          sellerIsSimpleRegime,
          sellerIsIncomeTaxDeclarant,
          icaRateUsed: null,
          reteIcaRateUsed: preview.reteIcaRateUsed,
          reteIcaRateOverride: preview.reteIcaRateOverrideUsed,
          impoconsumoRateUsed: preview.impoconsumoRateUsed,
          taxYear: preview.taxYear,
        },
        calculationMethod,
        taxEngineVersion,
        roundingMode,
        roundingScale: 2,
        sourceFingerprint: preview.sourceFingerprint ?? null,
        calculatedAt: now,
        lineSnapshotIds,
      },
    });

    return tx.saleFiscalContext.findUnique({
      where: uniqueWhere,
    });
  }

  private async resolveCalculationMethod(
    db: Prisma.TransactionClient | PrismaService,
    businessId: string,
    dto: TaxPreviewDto,
  ): Promise<TaxCalculationMethod> {
    if (!dto.sourceType && !dto.sourceId) {
      return TaxCalculationMethod.LINE_ROUNDED_V2;
    }
    if (!dto.sourceType || !dto.sourceId) {
      throw Object.assign(
        new Error('sourceType y sourceId deben enviarse juntos.'),
        { code: 'INVALID_FISCAL_SOURCE' },
      );
    }

    const sourceWhere =
      dto.sourceType === FiscalSourceType.ORDER
        ? { orderId: dto.sourceId }
        : { reservationId: dto.sourceId };
    const context = await (db as any).saleFiscalContext?.findFirst({
      where: { businessId, ...sourceWhere },
      select: { calculationMethod: true },
    });
    if (context) return context.calculationMethod;

    const source =
      dto.sourceType === FiscalSourceType.ORDER
        ? await (db as any).order.findFirst({
            where: { id: dto.sourceId, businessId },
            select: { id: true },
          })
        : await (db as any).reservation.findFirst({
            where: { id: dto.sourceId, businessId },
            select: { id: true },
          });
    if (!source) throw new NotFoundException('Fiscal sale source not found');
    return TaxCalculationMethod.LINE_ROUNDED_V2;
  }

  private async emptyTaxPreview(
    businessId: string,
    dto: TaxPreviewDto,
    options?: { profileMissing?: boolean; taxSettingsEnabled?: boolean; taxDisabledReason?: string },
    tx?: Prisma.TransactionClient,
    calculationMethod: TaxCalculationMethod =
      TaxCalculationMethod.LINE_ROUNDED_V2,
  ) {
    const db = tx || this.prisma;
    let subtotalTotal = new Prisma.Decimal(0);
    const profileMissing = options?.profileMissing ?? true;

    try {
      const itemIds = dto?.cartItems?.map((i) => i.itemId) || [];
      if (itemIds.length > 0) {
        const dbItems =
          (await db.item.findMany({
            where: { id: { in: itemIds }, businessId },
          })) || [];
        const itemsMap = new Map(dbItems.map((i) => [i.id, i]));
        for (const cartItem of dto.cartItems) {
          const item = itemsMap.get(cartItem.itemId);
          if (item) {
            const qty = new Prisma.Decimal(cartItem.quantity);
            const itemPrice = cartItem.unitPrice != null
              ? new Prisma.Decimal(cartItem.unitPrice)
              : new Prisma.Decimal(item.price);
            subtotalTotal = subtotalTotal.add(itemPrice.mul(qty));
          }
        }
      }
    } catch (e) {
      this.logger.error('Error calculating real subtotal for emptyTaxPreview', e);
    }

    const subtotal = calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
      ? roundCalculatedFiscalAmount(subtotalTotal)
      : subtotalTotal;
    return {
      subtotal,
      vatTotal: new Prisma.Decimal(0),
      impoconsumoTotal: new Prisma.Decimal(0),
      reteFuenteTotal: new Prisma.Decimal(0),
      reteIvaTotal: new Prisma.Decimal(0),
      reteIcaTotal: new Prisma.Decimal(0),
      autoRetencionTotal: new Prisma.Decimal(0),
      grossFiscalTotal: subtotal,
      netReceived: subtotal,
      taxLines: [],
      uvtValue: new Prisma.Decimal(52374),
      taxYear: new Date().getFullYear(),
      saleConceptUsed: dto.saleConcept ?? SaleConcept.GOODS,
      reteIcaRateUsed: new Prisma.Decimal(0),
      reteIcaRateOverrideUsed: null,
      impoconsumoRateUsed: null,
      sellerIsSimpleRegime: false,
      sellerIsIncomeTaxDeclarant: true,
      hasMixedConcepts: false,
      mixedConceptsWarning: null,
      profileMissing,
      taxSettingsEnabled: options?.taxSettingsEnabled ?? false,
      taxDisabledReason: options?.taxDisabledReason ?? null,
      itemBreakdown: [],
      sourceFingerprint: null,
      calculationMethod,
      taxEngineVersion:
        calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
          ? 'line-rounded-v2'
          : 'aggregate-v1',
      roundingMode:
        calculationMethod === TaxCalculationMethod.LINE_ROUNDED_V2
          ? FiscalRoundingMode.ROUND_HALF_UP
          : FiscalRoundingMode.DATABASE_DEFAULT,
      roundingScale: 2,
    };
  }
}
