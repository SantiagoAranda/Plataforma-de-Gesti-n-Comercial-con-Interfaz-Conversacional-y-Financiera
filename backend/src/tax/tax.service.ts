import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto, TaxPreviewCartItemDto } from './dto/tax-preview.dto';
import { PersonType, DocumentType, SaleConcept, TaxType, TaxDirection, Prisma } from '@prisma/client';

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
      this.logger.warn(`No tax profile configured for business ${businessId}. Returning zero tax.`);
      return await this.emptyTaxPreview(businessId, dto);
    }

    // 1. Obtener la UVT vigente
    const globalParams = await this.prisma.taxGlobalParameter.findFirst({
      where: { active: true },
      orderBy: { year: 'desc' },
    });
    const uvtValue = globalParams ? globalParams.uvt : new Prisma.Decimal(52374.0);
    const defaultVat = globalParams ? globalParams.defaultVatRate : new Prisma.Decimal(0.19);
    const defaultImpoconsumo = globalParams ? globalParams.defaultImpoconsumoRate : new Prisma.Decimal(0.08);

    // 2. Cargar ítems y calcular subtotal e impuestos a nivel de ítem (IVA e Impoconsumo)
    let subtotalTotal = new Prisma.Decimal(0);
    let vatTotal = new Prisma.Decimal(0);
    let impoconsumoTotal = new Prisma.Decimal(0);
    const taxLines: any[] = [];
    const itemIds = dto.cartItems.map((i) => i.itemId);
    const dbItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, businessId },
    });
    const itemsMap = new Map(dbItems.map((i) => [i.id, i]));

    const sellerIsIvaResponsable = sellerProfile.responsibilities.some(
      (r) => r.responsibility.code === '48',
    );

    for (const cartItem of dto.cartItems) {
      const item = itemsMap.get(cartItem.itemId);
      if (!item) continue;

      const qty = new Prisma.Decimal(cartItem.quantity);
      const itemPrice = new Prisma.Decimal(item.price);
      const itemSubtotal = itemPrice.mul(qty);
      subtotalTotal = subtotalTotal.add(itemSubtotal);

      // Calcular IVA
      let itemVat = new Prisma.Decimal(0);
      if (sellerIsIvaResponsable) {
        // En MVP, aplicamos IVA por defecto si el vendedor es responsable, a menos que el concepto esté excluido.
        // Conceptos GOODS y SERVICES aplican IVA.
        if (dto.saleConcept === SaleConcept.GOODS || dto.saleConcept === SaleConcept.SERVICES) {
          itemVat = itemSubtotal.mul(defaultVat);
          vatTotal = vatTotal.add(itemVat);
        }
      }

      // Calcular Impoconsumo
      let itemImpoconsumo = new Prisma.Decimal(0);
      if (item.appliesImpoconsumo) {
        const rate = item.impoconsumoRate ?? defaultImpoconsumo ?? new Prisma.Decimal(0.08);
        itemImpoconsumo = itemSubtotal.mul(rate);
        impoconsumoTotal = impoconsumoTotal.add(itemImpoconsumo);
      }
    }

    const impoconsumoBase = dto.cartItems.reduce((acc, cartItem) => {
      const item = itemsMap.get(cartItem.itemId);
      if (item && item.appliesImpoconsumo) {
        const qty = new Prisma.Decimal(cartItem.quantity);
        const itemPrice = new Prisma.Decimal(item.price);
        return acc.add(itemPrice.mul(qty));
      }
      return acc;
    }, new Prisma.Decimal(0));

    // Agregar línea de IVA si aplica
    if (vatTotal.gt(0)) {
      taxLines.push({
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        baseAmount: subtotalTotal,
        rate: defaultVat,
        taxAmount: vatTotal,
        accountCode: '2408',
        applied: true,
        reason: 'El vendedor es Responsable de IVA (48) y el concepto de venta aplica.',
      });
    } else if (sellerIsIvaResponsable) {
      taxLines.push({
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        baseAmount: subtotalTotal,
        rate: defaultVat,
        taxAmount: new Prisma.Decimal(0),
        accountCode: '2408',
        applied: false,
        reason: 'El concepto de venta no aplica IVA para este tipo de actividad en MVP.',
      });
    }

    // Agregar línea de Impoconsumo si aplica
    if (impoconsumoTotal.gt(0)) {
      taxLines.push({
        taxType: TaxType.IMPOCONSUMO,
        direction: TaxDirection.CHARGE,
        baseAmount: impoconsumoBase,
        rate: defaultImpoconsumo ?? new Prisma.Decimal(0.08),
        taxAmount: impoconsumoTotal,
        accountCode: '2420',
        applied: true,
        reason: 'Aplica Impoconsumo sobre ítems configurados individualmente.',
      });
    }

    // Cargar reglas tributarias personalizadas del negocio
    const rules = await this.prisma.salesTaxRule.findMany({
      where: { businessId, active: true },
    });

    const findRule = (taxType: TaxType, direction: TaxDirection) => {
      const specificRule = rules.find(
        (r) => r.taxType === taxType && r.direction === direction && r.saleConcept === dto.saleConcept
      );
      if (specificRule) return specificRule;
      return rules.find(
        (r) => r.taxType === taxType && r.direction === direction && !r.saleConcept
      );
    };

    const reteFuenteRule = findRule(TaxType.RETEFUENTE, TaxDirection.WITHHOLD);
    const reteIvaRule = findRule(TaxType.RETEIVA, TaxDirection.WITHHOLD);
    const autoRetencionRule = findRule(TaxType.AUTORRETENCION, TaxDirection.SELF);

    // 3. RETENCIONES (WITHHOLD) - Se restan del Neto Recibido
    let reteFuenteTotal = new Prisma.Decimal(0);
    let reteIvaTotal = new Prisma.Decimal(0);
    let reteIcaTotal = new Prisma.Decimal(0);

    const buyerIsRetenedorOrGran = dto.buyerIsRetenedor || dto.buyerIsGranContribuyente;
    const sellerIsRegimenSimple = sellerProfile.responsibilities.some((r) => r.responsibility.code === '47');

    // A. RETEFUENTE
    if (buyerIsRetenedorOrGran && !sellerIsRegimenSimple) {
      // Determinar base mínima y tasa por defecto de retención
      let minBaseUvt = new Prisma.Decimal(27); // compras por defecto
      let rate = new Prisma.Decimal(0.025); // 2.5% compras

      if (dto.saleConcept === SaleConcept.SERVICES) {
        minBaseUvt = new Prisma.Decimal(4);
        rate = new Prisma.Decimal(0.04); // 4% servicios declarantes
      } else if (dto.saleConcept === SaleConcept.HONORARIOS) {
        minBaseUvt = new Prisma.Decimal(0);
        rate = new Prisma.Decimal(0.10); // 10% honorarios
      } else if (dto.saleConcept === SaleConcept.ARRENDAMIENTOS) {
        minBaseUvt = new Prisma.Decimal(27);
        rate = new Prisma.Decimal(0.04); // 4% arrendamientos
      }

      // Si hay regla en base de datos, sobrescribimos
      if (reteFuenteRule) {
        minBaseUvt = reteFuenteRule.minBaseUvt;
        rate = reteFuenteRule.rate;
      }

      const minBaseCop = minBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        reteFuenteTotal = subtotalTotal.mul(rate);
        taxLines.push({
          taxType: TaxType.RETEFUENTE,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate,
          taxAmount: reteFuenteTotal,
          accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
          applied: true,
          reason: `Comprador es agente retenedor y la base supera ${minBaseUvt} UVT ($${minBaseCop.toFixed(0)} COP).`,
        });
      } else {
        taxLines.push({
          taxType: TaxType.RETEFUENTE,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate,
          taxAmount: new Prisma.Decimal(0),
          accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
          applied: false,
          reason: `Venta no alcanza la base mínima de retención de ${minBaseUvt} UVT ($${minBaseCop.toFixed(0)} COP).`,
        });
      }
    } else {
      taxLines.push({
        taxType: TaxType.RETEFUENTE,
        direction: TaxDirection.WITHHOLD,
        baseAmount: subtotalTotal,
        rate: reteFuenteRule?.rate ?? new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        accountCode: reteFuenteRule?.pucAccountCode ?? '135515',
        applied: false,
        reason: sellerIsRegimenSimple
          ? 'El vendedor pertenece al Régimen Simple (47) y está exento de retenciones.'
          : 'El comprador no es agente retenedor ni gran contribuyente.',
      });
    }

    // B. RETEIVA
    if (dto.buyerIsRetenedor && sellerIsIvaResponsable && vatTotal.gt(0)) {
      let minBaseUvt = new Prisma.Decimal(27);
      let rate = new Prisma.Decimal(0.15); // 15% de la tarifa del IVA

      if (dto.saleConcept === SaleConcept.SERVICES) {
        minBaseUvt = new Prisma.Decimal(4);
      }

      if (reteIvaRule) {
        minBaseUvt = reteIvaRule.minBaseUvt;
        rate = reteIvaRule.rate;
      }

      const minBaseCop = minBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        // En Colombia reteiva es rate (15%) sobre el valor del IVA
        reteIvaTotal = vatTotal.mul(rate);
        taxLines.push({
          taxType: TaxType.RETEIVA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: vatTotal,
          rate,
          taxAmount: reteIvaTotal,
          accountCode: reteIvaRule?.pucAccountCode ?? '135517',
          applied: true,
          reason: `Comprador es agente retenedor de IVA y superó base de ${minBaseUvt} UVT.`,
        });
      } else {
        taxLines.push({
          taxType: TaxType.RETEIVA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: vatTotal,
          rate,
          taxAmount: new Prisma.Decimal(0),
          accountCode: reteIvaRule?.pucAccountCode ?? '135517',
          applied: false,
          reason: `El subtotal no supera la base mínima de ${minBaseUvt} UVT.`,
        });
      }
    } else {
      taxLines.push({
        taxType: TaxType.RETEIVA,
        direction: TaxDirection.WITHHOLD,
        baseAmount: vatTotal,
        rate: reteIvaRule?.rate ?? new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        accountCode: reteIvaRule?.pucAccountCode ?? '135517',
        applied: false,
        reason: 'No se cumplen las condiciones para retención de IVA.',
      });
    }

    // C. RETEICA
    if (dto.buyerIsRetenedor && !sellerIsRegimenSimple && dto.fiscalMunicipalityCode) {
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

      if (icaRateObj) {
        const minBaseCop = icaRateObj.minBaseUvt.mul(uvtValue);
        if (subtotalTotal.gte(minBaseCop)) {
          reteIcaTotal = subtotalTotal.mul(icaRateObj.reteIcaRate);
          taxLines.push({
            taxType: TaxType.RETEICA,
            direction: TaxDirection.WITHHOLD,
            baseAmount: subtotalTotal,
            rate: icaRateObj.reteIcaRate,
            taxAmount: reteIcaTotal,
            accountCode: '135518',
            applied: true,
            reason: `Comprador retiene ICA para el municipio ${dto.fiscalMunicipalityCode} y la base supera ${icaRateObj.minBaseUvt} UVT.`,
          });
        } else {
          taxLines.push({
            taxType: TaxType.RETEICA,
            direction: TaxDirection.WITHHOLD,
            baseAmount: subtotalTotal,
            rate: icaRateObj.reteIcaRate,
            taxAmount: new Prisma.Decimal(0),
            accountCode: '135518',
            applied: false,
            reason: `Venta no alcanza la base mínima de ICA de ${icaRateObj.minBaseUvt} UVT para este municipio.`,
          });
        }
      } else {
        const sellerCiiuCode = sellerProfile.mainCiiuCode?.trim();
        taxLines.push({
          taxType: TaxType.RETEICA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: subtotalTotal,
          rate: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          accountCode: '135518',
          applied: false,
          reason: `No hay tarifa ICA configurada para el municipio ${dto.fiscalMunicipalityCode}${sellerCiiuCode ? ` y actividad CIIU ${sellerCiiuCode}` : ''}.`,
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
        reason: sellerIsRegimenSimple
          ? 'El vendedor pertenece al Régimen Simple (47) y está exento de ReteICA.'
          : 'Falta configurar municipio fiscal del comprador o este no es retenedor.',
      });
    }

    // 4. AUTORRETENCIONES (SELF) - No se restan del Neto Recibido
    let autoRetencionTotal = new Prisma.Decimal(0);
    const sellerIsAutorretenedor = sellerProfile.responsibilities.some((r) => r.responsibility.code === '15');

    if (sellerIsAutorretenedor || autoRetencionRule) {
      let rate = autoRetencionRule?.rate ?? new Prisma.Decimal(0.004); // Default 0.4% autorretención especial
      let minBaseUvt = autoRetencionRule?.minBaseUvt ?? new Prisma.Decimal(0);

      const minBaseCop = minBaseUvt.mul(uvtValue);
      if (subtotalTotal.gte(minBaseCop)) {
        autoRetencionTotal = subtotalTotal.mul(rate);
        taxLines.push({
          taxType: TaxType.AUTORRETENCION,
          direction: TaxDirection.SELF,
          baseAmount: subtotalTotal,
          rate,
          taxAmount: autoRetencionTotal,
          accountCode: autoRetencionRule?.pucAccountCode ?? '236575',
          applied: true,
          reason: 'El vendedor es autorretenedor y la venta superó la base mínima.',
        });
      }
    }

    // 5. CALCULAR NETO A RECIBIR (Sin restar autorretenciones)
    // netReceived = subtotal + IVA + impoconsumo - retefuente - reteiva - reteica
    let netReceived = subtotalTotal
      .add(vatTotal)
      .add(impoconsumoTotal)
      .sub(reteFuenteTotal)
      .sub(reteIvaTotal)
      .sub(reteIcaTotal);

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

  async freezeTaxCalculation(tx: Prisma.TransactionClient, orderId: string, preview: any, buyerData: any) {
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
    const sellerFiscalSnapshot = sellerProfile ? {
      tradeName: sellerProfile.tradeName,
      nit: sellerProfile.nit,
      dv: sellerProfile.dv,
      address: sellerProfile.address,
      municipalityCode: sellerProfile.municipalityCode,
      responsibilities: sellerProfile.responsibilities.map((r) => r.responsibility.code),
    } : {};

    // 1. Guardar OrderFiscalContext
    const chargedTaxTotal = new Prisma.Decimal(preview.vatTotal).add(new Prisma.Decimal(preview.impoconsumoTotal));
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

    // 2. Guardar SaleTaxLines (borrar anteriores si existen)
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

    // 3. Guardar TaxCalculationSnapshot
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
        const dbItems = (await this.prisma.item.findMany({
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
      uvtValue: new Prisma.Decimal(52374.0),
      profileMissing,
    };
  }
}
