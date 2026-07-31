import {
  FiscalRoundingMode,
  FiscalSourceType,
  ItemTaxTreatment,
  LineTaxType,
  Prisma,
  SaleConcept,
  TaxCalculationMethod,
  TaxDirection,
  TaxType,
} from '@prisma/client';
import { TaxService } from './tax.service';

const fn = () => jest.fn();

function preview(method = TaxCalculationMethod.LINE_ROUNDED_V2) {
  return {
    subtotal: new Prisma.Decimal(100),
    vatTotal: new Prisma.Decimal(19),
    impoconsumoTotal: new Prisma.Decimal(0),
    grossFiscalTotal: new Prisma.Decimal(119),
    reteFuenteTotal: new Prisma.Decimal(0),
    reteIvaTotal: new Prisma.Decimal(0),
    reteIcaTotal: new Prisma.Decimal(0),
    autoRetencionTotal: new Prisma.Decimal(0),
    netReceived: new Prisma.Decimal(119),
    taxLines: [
      {
        taxType: TaxType.IVA,
        direction: TaxDirection.CHARGE,
        taxTreatment: ItemTaxTreatment.TAXED,
        baseAmount: new Prisma.Decimal(100),
        rate: new Prisma.Decimal('0.19'),
        taxAmount: new Prisma.Decimal(19),
        saleConcept: SaleConcept.GOODS,
        accountCode: '2408',
        applied: true,
        reason: 'V2',
      },
    ],
    itemBreakdown: [
      {
        sourceLineKey: 'oi-1',
        itemId: 'item-1',
        fiscalCode: 'SKU-1',
        name: 'Producto',
        quantity: new Prisma.Decimal(1),
        unitPriceNet: new Prisma.Decimal(100),
        discountRate: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        unitMeasureCode: '94',
        standardCode: '999',
        taxTreatment: ItemTaxTreatment.TAXED,
        taxType: LineTaxType.VAT,
        taxRate: new Prisma.Decimal('0.19'),
        baseAmount: new Prisma.Decimal(100),
        taxAmount: new Prisma.Decimal(19),
        grossAmount: new Prisma.Decimal(119),
        saleConcept: SaleConcept.GOODS,
      },
    ],
    uvtValue: new Prisma.Decimal(52374),
    taxYear: 2026,
    saleConceptUsed: SaleConcept.GOODS,
    reteIcaRateUsed: new Prisma.Decimal(0),
    reteIcaRateOverrideUsed: null,
    impoconsumoRateUsed: null,
    sellerIsSimpleRegime: false,
    sellerIsIncomeTaxDeclarant: true,
    hasMixedConcepts: false,
    mixedConceptsWarning: null,
    sourceFingerprint: 'fingerprint',
    calculationMethod: method,
    taxEngineVersion:
      method === TaxCalculationMethod.LINE_ROUNDED_V2
        ? 'line-rounded-v2'
        : 'aggregate-v1',
    roundingMode:
      method === TaxCalculationMethod.LINE_ROUNDED_V2
        ? FiscalRoundingMode.ROUND_HALF_UP
        : FiscalRoundingMode.DATABASE_DEFAULT,
    roundingScale: 2,
  };
}

describe('TaxService V2 persistence', () => {
  const context = {
    id: 'context-1',
    calculationMethod: TaxCalculationMethod.LINE_ROUNDED_V2,
  };
  const tx: any = {
    order: {
      findUnique: fn(),
    },
    reservation: {
      findUnique: fn(),
    },
    saleFiscalContext: {
      findUnique: fn(),
      upsert: fn(),
    },
    saleTaxLine: {
      deleteMany: fn(),
      createMany: fn(),
    },
    saleItemFiscalSnapshot: {
      deleteMany: fn(),
      create: fn(),
    },
    taxCalculationSnapshot: {
      upsert: fn(),
    },
  };
  const service = new TaxService({} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      businessId: 'business-1',
      total: new Prisma.Decimal(100),
      items: [{ id: 'oi-1', itemId: 'item-1' }],
      business: { taxProfile: null },
    });
    tx.saleFiscalContext.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(context);
    tx.saleFiscalContext.upsert.mockResolvedValue(context);
    tx.saleItemFiscalSnapshot.create.mockResolvedValue({ id: 'snapshot-1' });
  });

  it('persists immutable-source line snapshots only for V2', async () => {
    await service.freezeTaxCalculation(
      tx,
      {
        sourceType: FiscalSourceType.ORDER,
        sourceId: 'order-1',
        businessId: 'business-1',
      },
      preview(),
      {},
    );

    expect(tx.saleItemFiscalSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fiscalContextId: 'context-1',
          orderItemId: 'oi-1',
          reservationId: null,
          calculationMethod: TaxCalculationMethod.LINE_ROUNDED_V2,
          roundingMode: FiscalRoundingMode.ROUND_HALF_UP,
        }),
      }),
    );
    expect(tx.saleFiscalContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          subtotal: new Prisma.Decimal(100),
          grossFiscalTotal: new Prisma.Decimal(119),
          calculationMethod: TaxCalculationMethod.LINE_ROUNDED_V2,
        }),
      }),
    );
    expect(tx.saleTaxLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          fiscalContextId: 'context-1',
          taxType: TaxType.IVA,
          taxableBase: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(19),
          calculationMethod: TaxCalculationMethod.LINE_ROUNDED_V2,
        }),
      ],
    });
    const persistedSnapshot =
      tx.taxCalculationSnapshot.upsert.mock.calls[0][0].create;
    expect(persistedSnapshot.lineSnapshotIds).toEqual(['snapshot-1']);
    expect(persistedSnapshot.rawCalculation.subtotal.toFixed(2)).toBe(
      '100.00',
    );
    expect(persistedSnapshot.rawCalculation.vatTotal.toFixed(2)).toBe('19.00');
    expect(persistedSnapshot.rawCalculation.impoconsumoTotal.toFixed(2)).toBe(
      '0.00',
    );
    expect(persistedSnapshot.rawCalculation.grossFiscalTotal.toFixed(2)).toBe(
      '119.00',
    );
    expect(persistedSnapshot.rawCalculation.netReceived.toFixed(2)).toBe(
      '119.00',
    );
  });

  it('blocks a divergent commercial total instead of overwriting it', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      businessId: 'business-1',
      total: new Prisma.Decimal('99.99'),
      items: [{ id: 'oi-1', itemId: 'item-1' }],
      business: { taxProfile: null },
    });

    await expect(
      service.freezeTaxCalculation(
        tx,
        {
          sourceType: FiscalSourceType.ORDER,
          sourceId: 'order-1',
          businessId: 'business-1',
        },
        preview(),
        {},
      ),
    ).rejects.toMatchObject({
      code: 'ORDER_TOTAL_FISCAL_BASE_MISMATCH',
    });
    expect(tx.saleItemFiscalSnapshot.create).not.toHaveBeenCalled();
  });
});
