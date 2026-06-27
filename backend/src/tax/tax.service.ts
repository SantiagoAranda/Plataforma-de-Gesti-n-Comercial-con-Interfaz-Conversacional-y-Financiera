import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto } from './dto/tax-preview.dto';
import {
  PersonType,
  SaleConcept,
  TaxDirection,
  TaxType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateTaxPreview(businessId: string, dto: TaxPreviewDto) {
    const sellerProfile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      include: {
        responsibilities: {
          include: {
            responsibility: true,
          },
        },
      },
    });

    if (!sellerProfile) {
      this.logger.warn(
        `No tax profile configured for business ${businessId}. Returning zero tax.`,
      );
      return await this.emptyTaxPreview(businessId, dto);
    }

    const globalParams = await this.prisma.taxGlobalParameter.findFirst({
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

    const itemIds = dto.cartItems.map((i) => i.itemId);
    const dbItems = await this.prisma.item.findMany({
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
    const withholdingSubjectIsDeclarante =
      dto.withholdingSubjectIsDeclarante ?? true;
    const buyerIsPersonaNatural = dto.buyerType === PersonType.NATURAL;
    const buyerIsRetenedorOrGran =
      dto.buyerIsRetenedor || dto.buyerIsGranContribuyente;

    for (const cartItem of dto.cartItems) {
      const item = itemsMap.get(cartItem.itemId);
      if (!item) continue;

      const qty = new Prisma.Decimal(cartItem.quantity);
      const itemPrice = new Prisma.Decimal(item.price);
      const itemSubtotal = itemPrice.mul(qty);
      subtotalTotal = subtotalTotal.add(itemSubtotal);

      if (sellerIsPersonaNaturalNoResponsable) {
        continue;
      }

      if (item.appliesImpoconsumo) {
        const rate =
          item.impoconsumoRate ?? defaultImpoconsumo ?? new Prisma.Decimal(0.08);
        impoconsumoBase = impoconsumoBase.add(itemSubtotal);
        impoconsumoTotal = impoconsumoTotal.add(itemSubtotal.mul(rate));
        continue;
      }

      if (sellerIsIvaResponsable) {
        vatBase = vatBase.add(itemSubtotal);
        vatTotal = vatTotal.add(itemSubtotal.mul(defaultVat));
      }
    }

    if (vatTotal.gt(0)) {
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

    if (impoconsumoTotal.gt(0)) {
      taxLines.push({
        taxType: TaxType.IMPOCONSUMO,
        direction: TaxDirection.CHARGE,
        baseAmount: impoconsumoBase,
        rate: defaultImpoconsumo ?? new Prisma.Decimal(0.08),
        taxAmount: impoconsumoTotal,
        accountCode: '519595',
        applied: true,
        reason: 'Aplica Impoconsumo sobre items configurados individualmente.',
      });
    }

    const rules = await this.prisma.salesTaxRule.findMany({
      where: { businessId, active: true },
    });

    const findRule = (taxType: TaxType, direction: TaxDirection) => {
      const specificRule = rules.find(
        (r) =>
          r.taxType === taxType &&
          r.direction === direction &&
          r.saleConcept === dto.saleConcept,
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
      switch (dto.saleConcept) {
        case SaleConcept.SERVICES:
          return {
            minBaseUvt: new Prisma.Decimal(15),
            rate: new Prisma.Decimal(withholdingSubjectIsDeclarante ? 0.04 : 0.06),
          };
        case SaleConcept.HONORARIOS:
          return {
            minBaseUvt: new Prisma.Decimal(0),
            rate: new Prisma.Decimal(withholdingSubjectIsDeclarante ? 0.11 : 0.1),
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
              withholdingSubjectIsDeclarante ? 0.025 : 0.035,
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
      buyerIsRetenedorOrGran &&
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
          reason: `Comprador es agente retenedor y la base supera ${reteFuenteMinBaseUvt} UVT.`,
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
                : 'El comprador no es agente retenedor ni gran contribuyente.',
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

    if (
      buyerIsRetenedorOrGran &&
      !buyerIsPersonaNatural &&
      !sellerIsRegimenSimple &&
      !sellerIsGranContribuyente &&
      dto.fiscalMunicipalityCode
    ) {
      const sellerCiiuCode = sellerProfile.mainCiiuCode?.trim();
      let icaRateObj = null;
      if (sellerCiiuCode) {
        icaRateObj = await this.prisma.municipalityIcaRate.findFirst({
          where: {
            businessId,
            municipalityCode: dto.fiscalMunicipalityCode,
            ciiuCode: sellerCiiuCode,
            active: true,
          },
        });
      }
      if (!icaRateObj) {
        icaRateObj = await this.prisma.municipalityIcaRate.findFirst({
          where: {
            businessId,
            municipalityCode: dto.fiscalMunicipalityCode,
            active: true,
          },
        });
      }

      const reteIcaRate = icaRateObj?.reteIcaRate ?? new Prisma.Decimal(0.00966);
      const reteIcaMinBaseUvt = icaRateObj?.minBaseUvt ?? new Prisma.Decimal(0);
      const minBaseCop = reteIcaMinBaseUvt.mul(uvtValue);
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
          reason: icaRateObj
            ? `Comprador retiene ICA para el municipio ${dto.fiscalMunicipalityCode} y la base supera ${reteIcaMinBaseUvt} UVT.`
            : `Fallback funcional Simulador_Ventas: ReteICA 9.66 por mil para el municipio ${dto.fiscalMunicipalityCode}.`,
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
          reason: `Venta no alcanza la base minima de ICA de ${reteIcaMinBaseUvt} UVT para este municipio.`,
        });
      }
    } else {
      taxLines.push({
        taxType: TaxType.RETEICA,
        direction: TaxDirection.WITHHOLD,
        baseAmount: subtotalTotal,
        rate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        accountCode: '135518',
        applied: false,
        reason: sellerIsGranContribuyente
          ? 'El vendedor es Gran Contribuyente; no aplica ReteICA.'
          : sellerIsRegimenSimple
            ? 'El vendedor pertenece al Regimen Simple (47) y esta exento de ReteICA.'
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

    let netReceived = subtotalTotal
      .add(vatTotal)
      .add(impoconsumoTotal)
      .sub(reteFuenteTotal)
      .sub(reteIcaTotal)
      .sub(reteIvaTotal);

    if (netReceived.lt(0)) {
      netReceived = new Prisma.Decimal(0);
    }

    return {
      subtotal: subtotalTotal,
      vatTotal,
      impoconsumoTotal,
      reteFuenteTotal,
      reteIvaTotal,
      reteIcaTotal,
      autoRetencionTotal,
      netReceived,
      taxLines,
      uvtValue,
      profileMissing: false,
    };
  }

  async freezeTaxCalculation(
    tx: Prisma.TransactionClient,
    orderId: string,
    preview: any,
    buyerData: any,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        business: {
          include: {
            taxProfile: {
              include: {
                responsibilities: {
                  include: {
                    responsibility: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Orden no encontrada');

    const sellerProfile = order.business.taxProfile;
    const sellerFiscalSnapshot = sellerProfile
      ? {
          tradeName: sellerProfile.tradeName,
          nit: sellerProfile.nit,
          dv: sellerProfile.dv,
          address: sellerProfile.address,
          municipalityCode: sellerProfile.municipalityCode,
          responsibilities: sellerProfile.responsibilities.map(
            (r) => r.responsibility.code,
          ),
        }
      : {};

    const chargedTaxTotal = new Prisma.Decimal(preview.vatTotal).add(
      new Prisma.Decimal(preview.impoconsumoTotal),
    );
    const withheldTaxTotal = new Prisma.Decimal(preview.reteFuenteTotal)
      .add(new Prisma.Decimal(preview.reteIvaTotal))
      .add(new Prisma.Decimal(preview.reteIcaTotal));

    await tx.orderFiscalContext.upsert({
      where: { orderId },
      update: {
        buyerType: buyerData.buyerType,
        buyerName: buyerData.buyerName,
        buyerDocumentType: buyerData.buyerDocumentType,
        buyerDocumentNumber: buyerData.buyerDocumentNumber,
        buyerEmail: buyerData.buyerEmail,
        buyerIsIvaResponsable: buyerData.buyerIsIvaResponsable ?? false,
        buyerIsRetenedor: buyerData.buyerIsRetenedor ?? false,
        buyerIsGranContribuyente: buyerData.buyerIsGranContribuyente ?? false,
        buyerIsAutorretenedor: buyerData.buyerIsAutorretenedor ?? false,
        buyerIsRegimenSimple: buyerData.buyerIsRegimenSimple ?? false,
        fiscalMunicipalityCode: buyerData.fiscalMunicipalityCode,
        saleConcept: buyerData.saleConcept,
        subtotal: preview.subtotal,
        chargedTaxTotal,
        withheldTaxTotal,
        netReceived: preview.netReceived,
      },
      create: {
        orderId,
        buyerType: buyerData.buyerType,
        buyerName: buyerData.buyerName,
        buyerDocumentType: buyerData.buyerDocumentType,
        buyerDocumentNumber: buyerData.buyerDocumentNumber,
        buyerEmail: buyerData.buyerEmail,
        buyerIsIvaResponsable: buyerData.buyerIsIvaResponsable ?? false,
        buyerIsRetenedor: buyerData.buyerIsRetenedor ?? false,
        buyerIsGranContribuyente: buyerData.buyerIsGranContribuyente ?? false,
        buyerIsAutorretenedor: buyerData.buyerIsAutorretenedor ?? false,
        buyerIsRegimenSimple: buyerData.buyerIsRegimenSimple ?? false,
        fiscalMunicipalityCode: buyerData.fiscalMunicipalityCode,
        saleConcept: buyerData.saleConcept,
        subtotal: preview.subtotal,
        chargedTaxTotal,
        withheldTaxTotal,
        netReceived: preview.netReceived,
      },
    });

    await tx.saleTaxLine.deleteMany({
      where: { orderId },
    });

    if (preview.taxLines.length > 0) {
      await tx.saleTaxLine.createMany({
        data: preview.taxLines.map((l: any) => ({
          orderId,
          taxType: l.taxType,
          direction: l.direction,
          baseAmount: l.baseAmount,
          rate: l.rate,
          taxAmount: l.taxAmount,
          accountCode: l.accountCode,
          applied: l.applied,
          reason: l.reason,
        })),
      });
    }

    await tx.taxCalculationSnapshot.upsert({
      where: { orderId },
      update: {
        uvtValue: preview.uvtValue,
        sellerFiscal: sellerFiscalSnapshot,
        buyerFiscal: buyerData,
        rawCalculation: {
          subtotal: preview.subtotal,
          vatTotal: preview.vatTotal,
          impoconsumoTotal: preview.impoconsumoTotal,
          reteFuenteTotal: preview.reteFuenteTotal,
          reteIvaTotal: preview.reteIvaTotal,
          reteIcaTotal: preview.reteIcaTotal,
          autoRetencionTotal: preview.autoRetencionTotal,
          netReceived: preview.netReceived,
          allLines: preview.taxLines,
        },
      },
      create: {
        orderId,
        uvtValue: preview.uvtValue,
        sellerFiscal: sellerFiscalSnapshot,
        buyerFiscal: buyerData,
        rawCalculation: {
          subtotal: preview.subtotal,
          vatTotal: preview.vatTotal,
          impoconsumoTotal: preview.impoconsumoTotal,
          reteFuenteTotal: preview.reteFuenteTotal,
          reteIvaTotal: preview.reteIvaTotal,
          reteIcaTotal: preview.reteIcaTotal,
          autoRetencionTotal: preview.autoRetencionTotal,
          netReceived: preview.netReceived,
          allLines: preview.taxLines,
        },
      },
    });

    return tx.orderFiscalContext.findUnique({
      where: { orderId },
    });
  }

  private async emptyTaxPreview(businessId: string, dto: TaxPreviewDto) {
    let subtotalTotal = new Prisma.Decimal(0);
    const profileMissing = true;

    try {
      const itemIds = dto?.cartItems?.map((i) => i.itemId) || [];
      if (itemIds.length > 0) {
        const dbItems =
          (await this.prisma.item.findMany({
            where: { id: { in: itemIds }, businessId },
          })) || [];
        const itemsMap = new Map(dbItems.map((i) => [i.id, i]));
        for (const cartItem of dto.cartItems) {
          const item = itemsMap.get(cartItem.itemId);
          if (item) {
            const qty = new Prisma.Decimal(cartItem.quantity);
            const itemPrice = new Prisma.Decimal(item.price);
            subtotalTotal = subtotalTotal.add(itemPrice.mul(qty));
          }
        }
      }
    } catch (e) {
      this.logger.error('Error calculating real subtotal for emptyTaxPreview', e);
    }

    return {
      subtotal: subtotalTotal,
      vatTotal: new Prisma.Decimal(0),
      impoconsumoTotal: new Prisma.Decimal(0),
      reteFuenteTotal: new Prisma.Decimal(0),
      reteIvaTotal: new Prisma.Decimal(0),
      reteIcaTotal: new Prisma.Decimal(0),
      autoRetencionTotal: new Prisma.Decimal(0),
      netReceived: subtotalTotal,
      taxLines: [],
      uvtValue: new Prisma.Decimal(52374),
      profileMissing,
    };
  }
}
