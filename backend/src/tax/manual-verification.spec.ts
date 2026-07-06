import { Test } from '@nestjs/testing';
import { TaxService } from './tax.service';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaxPreviewDto } from './dto/tax-preview.dto';
import { PersonType, DocumentType, SaleConcept, TaxType, TaxDirection } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('Manual Verification of Colombian Tax Module', () => {
  let service: TaxService;
  let prismaMock: any;
  const businessId = 'business-1';

  beforeEach(async () => {
    prismaMock = {
      businessTaxProfile: { findUnique: jest.fn() },
      taxGlobalParameter: { findFirst: jest.fn() },
      item: { findMany: jest.fn() },
      salesTaxRule: { findMany: jest.fn() },
      municipalityIcaRate: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        TaxService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<TaxService>(TaxService);
  });

  it('1. venta sin RUT - should return profileMissing: true and calculate real subtotal of items', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue(null);
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(15000), appliesImpoconsumo: false },
      { id: 'item-2', price: new Prisma.Decimal(25000), appliesImpoconsumo: false },
    ]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      saleConcept: SaleConcept.GOODS,
      cartItems: [
        { itemId: 'item-1', quantity: 2 },
        { itemId: 'item-2', quantity: 1 },
      ],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 1: Venta sin RUT ---');
    console.log('profileMissing:', result.profileMissing);
    console.log('calculated subtotal (real):', result.subtotal.toString());
    console.log('netReceived:', result.netReceived.toString());

    expect(result.profileMissing).toBe(true);
    expect(result.subtotal.toNumber()).toBe(55000); // 15000*2 + 25000*1
    expect(result.netReceived.toNumber()).toBe(55000);
  });

  it('2. venta con IVA - should charge 19% IVA if seller is responsible (code 48)', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(10000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      saleConcept: SaleConcept.GOODS,
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 2: Venta con IVA ---');
    console.log('vatTotal:', result.vatTotal.toString());
    console.log('netReceived:', result.netReceived.toString());
    console.log('taxLines:', result.taxLines.map(l => `${l.taxType}: ${l.taxAmount} (applied=${l.applied})`));

    expect(result.vatTotal.toNumber()).toBe(1900); // 10000 * 0.19
    expect(result.netReceived.toNumber()).toBe(11900);
    const vatLine = result.taxLines.find(l => l.taxType === TaxType.IVA);
    expect(vatLine?.applied).toBe(true);
  });

  it('3. venta no responsable IVA - should charge 0% IVA if seller is not responsible (code 49)', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      responsibilities: [{ responsibility: { code: '49' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(10000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      saleConcept: SaleConcept.GOODS,
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 3: Venta no responsable IVA ---');
    console.log('vatTotal:', result.vatTotal.toString());
    console.log('netReceived:', result.netReceived.toString());

    expect(result.vatTotal.toNumber()).toBe(0);
    expect(result.netReceived.toNumber()).toBe(10000);
  });

  it('4. venta con comprador retenedor - should apply ReteFuente and ReteIVA if buyer has flags', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(1000000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([
      {
        taxType: TaxType.RETEFUENTE,
        direction: TaxDirection.WITHHOLD,
        rate: new Prisma.Decimal(0.025),
        minBaseUvt: new Prisma.Decimal(4),
        active: true,
        pucAccountCode: '236540',
      },
      {
        taxType: TaxType.RETEIVA,
        direction: TaxDirection.WITHHOLD,
        rate: new Prisma.Decimal(0.15),
        minBaseUvt: new Prisma.Decimal(0),
        active: true,
        pucAccountCode: '236701',
      },
    ]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: true,
      buyerIsRetenedor: true,
      buyerIsGranContribuyente: true,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      saleConcept: SaleConcept.GOODS,
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 4: Comprador Retenedor ---');
    console.log('subtotal:', result.subtotal.toString());
    console.log('vatTotal:', result.vatTotal.toString());
    console.log('reteFuenteTotal:', result.reteFuenteTotal.toString());
    console.log('reteIvaTotal:', result.reteIvaTotal.toString());
    console.log('netReceived:', result.netReceived.toString());

    expect(result.reteFuenteTotal.toNumber()).toBe(25000); // 1000000 * 0.025
    expect(result.reteIvaTotal.toNumber()).toBe(28500); // 190000 (VAT) * 0.15
  });

  it('5. venta con impoconsumo - should calculate Impoconsumo without IVA on the same item', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(30000), appliesImpoconsumo: true, impoconsumoRate: new Prisma.Decimal(0.08) },
      { id: 'item-2', price: new Prisma.Decimal(70000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      saleConcept: SaleConcept.GOODS,
      cartItems: [
        { itemId: 'item-1', quantity: 1 },
        { itemId: 'item-2', quantity: 1 },
      ],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 5: Impoconsumo Base Amount ---');
    console.log('total subtotal:', result.subtotal.toString());
    const impoLine = result.taxLines.find(l => l.taxType === TaxType.IMPOCONSUMO);
    console.log('impoconsumo baseAmount:', impoLine?.baseAmount.toString());
    console.log('impoconsumo taxAmount:', impoLine?.taxAmount.toString());

    expect(result.subtotal.toNumber()).toBe(100000);
    expect(impoLine?.baseAmount.toNumber()).toBe(30000); // Only item-1
    expect(impoLine?.taxAmount.toNumber()).toBe(2400); // 30000 * 0.08
    expect(result.vatTotal.toNumber()).toBe(13300); // Only item-2: 70000 * 0.19
  });

  it('6. venta con ReteICA - should lookup rate with seller main CIIU', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      mainCiiuCode: '5611',
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(500000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);
    prismaMock.municipalityIcaRate.findFirst.mockResolvedValue({
      municipalityCode: '11001',
      ciiuCode: '5611',
      minBaseUvt: new Prisma.Decimal(0),
      reteIcaRate: new Prisma.Decimal(0.00966),
      active: true,
    });

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: true,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      fiscalMunicipalityCode: '11001',
      saleConcept: SaleConcept.GOODS,
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 6: ReteICA con CIIU ---');
    const icaLine = result.taxLines.find(l => l.taxType === TaxType.RETEICA);
    console.log('reteIca applied:', icaLine?.applied);
    console.log('reteIca rate:', icaLine?.rate.toString());
    console.log('reteIca taxAmount:', icaLine?.taxAmount.toString());

    expect(prismaMock.municipalityIcaRate.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'business-1',
        municipalityCode: '11001',
        ciiuCode: '5611',
        active: true,
      },
    });
    expect(icaLine?.applied).toBe(true);
    expect(icaLine?.taxAmount.toNumber()).toBe(4830); // 500000 * 0.00966
  });

  it('7. venta sin tarifa ICA - should use simulator fallback 9.66 per thousand', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      mainCiiuCode: '5611',
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(500000), appliesImpoconsumo: false },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);
    prismaMock.municipalityIcaRate.findFirst.mockResolvedValue(null);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: true,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      fiscalMunicipalityCode: '11001',
      saleConcept: SaleConcept.GOODS,
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 7: Venta sin tarifa ICA ---');
    const icaLine = result.taxLines.find(l => l.taxType === TaxType.RETEICA);
    console.log('reteIca applied:', icaLine?.applied);
    console.log('reteIca rate:', icaLine?.rate.toString());
    console.log('reteIca reason:', icaLine?.reason);

    expect(icaLine?.applied).toBe(true);
    expect(icaLine?.rate.toString()).toBe('0.00966');
    expect(icaLine?.taxAmount.toNumber()).toBe(4830);
    expect(icaLine?.reason).toContain('Fallback funcional Simulador_Ventas');
  });

  it('8. snapshot histórico - freezeTaxCalculation should persist all tax lines (applied=true and applied=false)', async () => {
    const txMock = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          businessId: 'business-1',
          total: 100000,
          business: {
            taxProfile: {
              tradeName: 'Test Business',
              nit: '123456789-0',
              responsibilities: [],
            },
          },
        }),
      },
      saleTaxLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      taxCalculationSnapshot: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      orderFiscalContext: {
        findUnique: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const preview = {
      subtotal: new Prisma.Decimal(100000),
      vatTotal: new Prisma.Decimal(19000),
      impoconsumoTotal: new Prisma.Decimal(0),
      reteFuenteTotal: new Prisma.Decimal(0),
      reteIvaTotal: new Prisma.Decimal(0),
      reteIcaTotal: new Prisma.Decimal(0),
      autoRetencionTotal: new Prisma.Decimal(0),
      netReceived: new Prisma.Decimal(119000),
      uvtValue: new Prisma.Decimal(52374),
      taxLines: [
        {
          taxType: TaxType.IVA,
          direction: TaxDirection.CHARGE,
          baseAmount: new Prisma.Decimal(100000),
          rate: new Prisma.Decimal(0.19),
          taxAmount: new Prisma.Decimal(19000),
          accountCode: '2408',
          applied: true,
          reason: 'Applied IVA',
        },
        {
          taxType: TaxType.RETEICA,
          direction: TaxDirection.WITHHOLD,
          baseAmount: new Prisma.Decimal(100000),
          rate: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          accountCode: '135518',
          applied: false,
          reason: 'No ICA rate configured',
        },
      ],
    };

    const buyerData = {
      buyerType: PersonType.JURIDICA,
      buyerName: 'Buyer Test',
      buyerRequiresElectronicInvoice: true,
    };

    await service.freezeTaxCalculation(txMock as any, 'order-1', preview, buyerData);
    console.log('--- TEST 8: Snapshot Histórico ---');
    const createdLines = txMock.saleTaxLine.createMany.mock.calls[0][0].data;
    console.log('Number of lines persisted to SaleTaxLine:', createdLines.length);
    console.log('Persisted lines details:', createdLines.map((l: any) => `${l.taxType} (applied=${l.applied})`));

    expect(createdLines.length).toBe(2);
    expect(createdLines[0].applied).toBe(true);
    expect(createdLines[1].applied).toBe(false);
    expect(txMock.orderFiscalContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          buyerRequiresElectronicInvoice: true,
        }),
        update: expect.objectContaining({
          buyerRequiresElectronicInvoice: true,
        }),
      }),
    );
    expect(txMock.taxCalculationSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          buyerFiscal: expect.objectContaining({
            buyerRequiresElectronicInvoice: true,
          }),
        }),
      }),
    );
  });

  it('9. AccountingMovement cuadrado por originType=ORDER y originId=orderId - should assert balanced entries and throw on desbalance', async () => {
    const prisma = {
      pucCuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve({ code: where.code, name: 'Test Account', grupo: null })
        ),
      },
      pucSubcuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve({
            code: where.code,
            name: 'Test Subaccount',
            active: true,
            cuentaCode: String(where.code).slice(0, 4),
            cuenta: { code: String(where.code).slice(0, 4), name: 'Test Account', grupo: null },
          })
        ),
      },
    } as any;

    const accountingService = new AccountingService(prisma);

    const txMock = {
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([{ totalValue: new Prisma.Decimal(4000) }]),
      },
      orderFiscalContext: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      saleTaxLine: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
      salesTaxRule: {
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      accountingMovement: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: `movement-${data.pucCuentaCode ?? data.pucSubcuentaId}-${data.nature}`,
            ...data,
          })
        ),
      },
    } as any;

    const orderData = {
      id: 'order-123',
      total: new Prisma.Decimal(10000),
      customerName: 'Victoria',
      accountingPostedAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z'),
      paymentMethod: 'CASH',
      items: [
        {
          itemTypeSnapshot: 'PRODUCT',
          item: { type: 'PRODUCT' },
        },
      ],
    } as any;

    // Call service to post order movements
    await accountingService.postOrderMovements(txMock, 'business-1', orderData);

    console.log('--- TEST 9: Contabilidad Cuadrada ---');
    const createdMovements = txMock.accountingMovement.create.mock.calls.map(([call]: any) => call.data);
    console.log('Number of created movements:', createdMovements.length);
    console.log('Movements details:', createdMovements.map((m: any) => `${m.pucSubcuentaId ?? m.pucCuentaCode} ${m.nature} ${m.amount.toString()}`));
    expect(createdMovements.map((m: any) => m.pucSubcuentaId ?? m.pucCuentaCode)).toEqual([
      '110505',
      '413595',
      '6135',
      '1435',
    ]);
    
    // Check that all movements have originType: 'ORDER' and originId: 'order-123'
    for (const movement of createdMovements) {
      expect(movement.originType).toBe('ORDER');
      expect(movement.originId).toBe('order-123');
    }
    console.log('All movements verified: originType === "ORDER" and originId === "order-123"');

    // Calculate total debits vs total credits
    let totalDebits = new Prisma.Decimal(0);
    let totalCredits = new Prisma.Decimal(0);
    for (const movement of createdMovements) {
      if (movement.nature === 'DEBIT') {
        totalDebits = totalDebits.add(movement.amount);
      } else {
        totalCredits = totalCredits.add(movement.amount);
      }
    }
    console.log(`Total Debits: ${totalDebits.toString()} | Total Credits: ${totalCredits.toString()}`);
    expect(totalDebits.equals(totalCredits)).toBe(true);

    txMock.saleTaxLine.findMany.mockResolvedValue([
      {
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        baseAmount: new Prisma.Decimal(10000),
        taxAmount: new Prisma.Decimal(1900),
        accountCode: '2408',
        applied: true,
      }
    ]);

    await expect(
      accountingService.postOrderMovements(txMock, 'business-1', orderData)
    ).rejects.toThrow();
    console.log('Balance check verified: Throws exception when entries are unbalanced.');
  });

  it('10. saleConcept derivation - should prioritize SERVICES over GOODS and return warning on mixed concepts', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      responsibilities: [{ responsibility: { code: '48' } }],
      isIncomeTaxDeclarant: true,
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-goods', price: new Prisma.Decimal(10000), appliesImpoconsumo: false, saleConcept: SaleConcept.GOODS },
      { id: 'item-services', price: new Prisma.Decimal(20000), appliesImpoconsumo: false, saleConcept: SaleConcept.SERVICES },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      cartItems: [
        { itemId: 'item-goods', quantity: 1 },
        { itemId: 'item-services', quantity: 1 },
      ],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 10: Derivación saleConcept mixto ---');
    console.log('saleConceptUsed:', result.saleConceptUsed);
    console.log('hasMixedConcepts:', result.hasMixedConcepts);
    console.log('mixedConceptsWarning:', result.mixedConceptsWarning);

    expect(result.saleConceptUsed).toBe(SaleConcept.SERVICES);
    expect(result.hasMixedConcepts).toBe(true);
    expect(result.mixedConceptsWarning).toContain('Se detectaron múltiples conceptos fiscales');
  });

  it('11. icaRateOverride - should apply ReteICA if override is specified and > 0, bypassing buyer checks', async () => {
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      personType: PersonType.JURIDICA,
      responsibilities: [{ responsibility: { code: '48' } }],
    });
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(1000000), appliesImpoconsumo: false, saleConcept: SaleConcept.GOODS },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);

    const dto: TaxPreviewDto = {
      buyerIsIvaResponsable: false,
      buyerIsRetenedor: false,
      buyerIsGranContribuyente: false,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      icaRateOverride: 5, // 5 por mil -> 0.005
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const result = await service.calculateTaxPreview('business-1', dto);
    console.log('--- TEST 11: icaRateOverride ---');
    const icaLine = result.taxLines.find(l => l.taxType === TaxType.RETEICA);
    console.log('reteIca applied:', icaLine?.applied);
    console.log('reteIca rate:', icaLine?.rate.toString());
    console.log('reteIca taxAmount:', icaLine?.taxAmount.toString());

    expect(icaLine?.applied).toBe(true);
    expect(icaLine?.rate.toNumber()).toBe(0.005);
    expect(icaLine?.taxAmount.toNumber()).toBe(5000); // 1000000 * 0.005
  });

  it('12. ReteICA default by personType - Natural = 0, Juridica = config or 9.66', async () => {
    prismaMock.taxGlobalParameter.findFirst.mockResolvedValue({
      uvt: new Prisma.Decimal(52374),
      defaultVatRate: new Prisma.Decimal(0.19),
      defaultImpoconsumoRate: new Prisma.Decimal(0.08),
    });
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', price: new Prisma.Decimal(1000000), appliesImpoconsumo: false, saleConcept: SaleConcept.GOODS },
    ]);
    prismaMock.salesTaxRule.findMany.mockResolvedValue([]);
    prismaMock.municipalityIcaRate.findFirst.mockResolvedValue(null);

    // Vendedor es Persona Natural
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      personType: PersonType.NATURAL,
      responsibilities: [{ responsibility: { code: '48' } }],
    });

    const dtoNatural: TaxPreviewDto = {
      buyerIsIvaResponsable: true,
      buyerIsRetenedor: true,
      buyerIsGranContribuyente: true,
      buyerIsAutorretenedor: false,
      buyerIsRegimenSimple: false,
      fiscalMunicipalityCode: '11001',
      cartItems: [{ itemId: 'item-1', quantity: 1 }],
    };

    const resultNatural = await service.calculateTaxPreview('business-1', dtoNatural);
    console.log('--- TEST 12: ReteICA Persona Natural vs Juridica ---');
    console.log('Natural ReteICA total:', resultNatural.reteIcaTotal.toNumber());
    expect(resultNatural.reteIcaTotal.toNumber()).toBe(0);

    // Vendedor es Persona Jurídica
    prismaMock.businessTaxProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      personType: PersonType.JURIDICA,
      responsibilities: [{ responsibility: { code: '48' } }],
    });

    const resultJuridica = await service.calculateTaxPreview('business-1', dtoNatural);
    console.log('Juridica ReteICA total:', resultJuridica.reteIcaTotal.toNumber());
    expect(resultJuridica.reteIcaTotal.toNumber()).toBe(9660);
  });
});
