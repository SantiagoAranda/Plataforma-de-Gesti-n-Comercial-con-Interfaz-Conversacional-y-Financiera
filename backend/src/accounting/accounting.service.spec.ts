import { Prisma, TaxDirection, TaxType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { AccountingService } from './accounting.service';

describe('AccountingService automatic order postings', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';

  const pucNames: Record<string, string> = {
    '1105': 'Caja',
    '1110': 'Bancos',
    '1355': 'Anticipo de impuestos y contribuciones',
    '1435': 'Mercancias no fabricadas por la empresa',
    '2408': 'Impuesto sobre las ventas por pagar',
    '4135': 'Comercio al por mayor y al por menor',
    '5195': 'Diversos',
    '6135': 'Comercio al por mayor y al por menor',
  };

  const pucSubcuentaNames: Record<string, string> = {
    '110505': 'Caja general',
    '111005': 'Moneda nacional',
    '135515': 'Retencion en la fuente',
    '135517': 'Impuesto a las ventas retenido',
    '135518': 'Impuesto de industria y comercio retenido',
    '413595': 'Venta de otros productos',
    '519595': 'Otros',
  };

  function pucCuenta(code: string) {
    return {
      code,
      name: pucNames[code] ?? code,
      grupo: null,
    };
  }

  function pucSubcuenta(code: string) {
    return {
      code,
      name: pucSubcuentaNames[code] ?? code,
      cuentaCode: code.slice(0, 4),
      active: true,
      cuenta: pucCuenta(code.slice(0, 4)),
    };
  }

  function createService() {
    const prisma = {
      pucCuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(pucCuenta(where.code)),
        ),
      },
      pucSubcuenta: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(pucSubcuenta(where.code)),
        ),
      },
    } as any;

    const tx = {
      inventoryMovement: {
        findMany: jest.fn(),
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
            pucCuenta: data.pucCuentaCode ? pucCuenta(data.pucCuentaCode) : null,
            pucSubcuenta: data.pucSubcuentaId
              ? pucSubcuenta(data.pucSubcuentaId)
              : null,
          }),
        ),
      },
    } as any;

    return { service: new AccountingService(prisma), prisma, tx };
  }

  function order(overrides: Record<string, any> = {}) {
    return {
      id: orderId,
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
      ...overrides,
    } as any;
  }

  function createdLines(tx: any) {
    return tx.accountingMovement.create.mock.calls.map(([call]: any[]) => ({
      code: call.data.pucSubcuentaId ?? call.data.pucCuentaCode,
      cuenta: call.data.pucCuentaCode,
      subcuenta: call.data.pucSubcuentaId,
      nature: call.data.nature,
      amount: call.data.amount.toString(),
      detail: call.data.detail,
      taxType: call.data.metadata?.taxType,
    }));
  }

  function totalsByNature(createCalls: any[]) {
    return createCalls.reduce(
      (totals, [call]) => {
        const amount = new Prisma.Decimal(call.data.amount);
        if (call.data.nature === 'DEBIT') {
          totals.debit = totals.debit.add(amount);
        } else {
          totals.credit = totals.credit.add(amount);
        }
        return totals;
      },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
  }

  it('posts cash and income defaults to existing six-digit PUC subaccounts', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      { totalValue: new Prisma.Decimal(4000) },
    ]);

    await service.postOrderMovements(tx, businessId, order());

    const lines = createdLines(tx);
    expect(lines.map((line) => [line.code, line.nature, line.amount])).toEqual([
      ['110505', 'DEBIT', '10000'],
      ['413595', 'CREDIT', '10000'],
      ['6135', 'DEBIT', '4000'],
      ['1435', 'CREDIT', '4000'],
    ]);
    expect(lines[0].cuenta).toBeNull();
    expect(lines[0].subcuenta).toBe('110505');
    expect(lines[1].cuenta).toBeNull();
    expect(lines[1].subcuenta).toBe('413595');

    const totals = totalsByNature(tx.accountingMovement.create.mock.calls);
    expect(totals.debit.toString()).toBe('14000');
    expect(totals.credit.toString()).toBe('14000');
  });

  it('posts bank transfer net received to 111005 without forcing cash', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({ paymentMethod: 'BANK_TRANSFER' }),
    );

    const lines = createdLines(tx);
    expect(lines[0].code).toBe('111005');
    expect(lines[0].subcuenta).toBe('111005');
  });

  it('keeps service income semantics while using the shared existing income subaccount', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        items: [
          {
            itemNameSnapshot: 'Asesoria',
            itemTypeSnapshot: 'SERVICE',
            lineTotal: new Prisma.Decimal(10000),
            item: { type: 'SERVICE' },
          },
        ],
      }),
    );

    const incomeLine = createdLines(tx)[1];
    expect(incomeLine.code).toBe('413595');
    expect(incomeLine.detail).toBe('Ingreso por servicio - Asesoria');
  });

  it('posts mixed manual order income and costs differentiated by line', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        totalValue: new Prisma.Decimal(4000),
        orderItemId: 'product-line',
        reservationId: null,
      },
      {
        totalValue: new Prisma.Decimal(900),
        orderItemId: 'service-line',
        reservationId: null,
      },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        total: new Prisma.Decimal(20000),
        items: [
          {
            id: 'product-line',
            itemId: 'product-1',
            itemNameSnapshot: 'Producto A',
            itemTypeSnapshot: 'PRODUCT',
            quantity: 1,
            lineTotal: new Prisma.Decimal(10000),
            item: { id: 'product-1', name: 'Producto A', type: 'PRODUCT' },
          },
          {
            id: 'service-line',
            itemId: 'service-1',
            itemNameSnapshot: 'Servicio B',
            itemTypeSnapshot: 'SERVICE',
            quantity: 1,
            lineTotal: new Prisma.Decimal(10000),
            item: { id: 'service-1', name: 'Servicio B', type: 'SERVICE' },
          },
        ],
      }),
    );

    const lines = createdLines(tx);
    expect(lines.map((line) => line.detail)).toEqual([
      'Contrapartida venta mixta',
      'Ingreso por venta de producto - Producto A',
      'Ingreso por servicio - Servicio B',
      'Costo de venta de producto - Producto A',
      'Salida de inventario por venta de producto - Producto A',
      'Consumo de insumos por servicio - Servicio B',
      'Salida de inventario por servicio - Servicio B',
    ]);

    const totals = totalsByNature(tx.accountingMovement.create.mock.calls);
    expect(totals.debit.toString()).toBe('24900');
    expect(totals.credit.toString()).toBe('24900');
  });

  it('resolves six-digit tax line account codes as PUC subaccounts', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);
    tx.orderFiscalContext.findUnique.mockResolvedValue({
      netReceived: new Prisma.Decimal(105500),
    });
    tx.saleTaxLine.findMany.mockResolvedValue([
      {
        taxType: TaxType.RETEFUENTE,
        direction: TaxDirection.WITHHOLD,
        taxAmount: new Prisma.Decimal(2500),
        accountCode: '135515',
        applied: true,
      },
      {
        taxType: TaxType.IMPOCONSUMO,
        direction: TaxDirection.CHARGE,
        taxAmount: new Prisma.Decimal(8000),
        accountCode: '519595',
        applied: true,
      },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({ total: new Prisma.Decimal(100000) }),
    );

    const lines = createdLines(tx);
    expect(lines.map((line) => [line.code, line.nature, line.amount, line.taxType])).toEqual([
      ['110505', 'DEBIT', '105500', 'NET_RECEIVED'],
      ['135515', 'DEBIT', '2500', 'RETEFUENTE'],
      ['413595', 'CREDIT', '100000', undefined],
      ['519595', 'CREDIT', '8000', 'IMPOCONSUMO'],
    ]);
  });
});
