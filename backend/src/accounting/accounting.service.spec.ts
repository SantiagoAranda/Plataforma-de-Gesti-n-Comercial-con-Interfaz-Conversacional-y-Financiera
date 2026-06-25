import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { AccountingService } from './accounting.service';

describe('AccountingService automatic order postings', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';

  const pucNames: Record<string, string> = {
    '1105': 'Caja',
    '1110': 'Bancos',
    '1435': 'Mercancías no fabricadas por la empresa',
    '4135': 'Comercio al por mayor y al por menor',
    '6135': 'Comercio al por mayor y al por menor',
  };

  function pucCuenta(code: string) {
    return {
      code,
      name: pucNames[code] ?? code,
      grupo: null,
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
        findUnique: jest.fn(),
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
            id: `movement-${data.pucCuentaCode}-${data.nature}`,
            ...data,
            pucCuenta: data.pucCuentaCode ? pucCuenta(data.pucCuentaCode) : null,
            pucSubcuenta: null,
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

  it('posts income and cost for a SIMPLE stock sale and keeps the entry balanced', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      { totalValue: new Prisma.Decimal(4000) },
    ]);

    await service.postOrderMovements(tx, businessId, order());

    const calls = tx.accountingMovement.create.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map(([call]: any[]) => [call.data.pucCuentaCode, call.data.nature, call.data.amount.toString()])).toEqual([
      ['1105', 'DEBIT', '10000'],
      ['4135', 'CREDIT', '10000'],
      ['6135', 'DEBIT', '4000'],
      ['1435', 'CREDIT', '4000'],
    ]);
    expect(calls.map(([call]: any[]) => call.data.detail)).toEqual([
      'Contrapartida producto - Producto',
      'Ingreso por venta de producto - Producto',
      'Costo de venta de producto - Producto',
      'Salida de inventario por venta de producto - Producto',
    ]);

    const totals = totalsByNature(calls);
    expect(totals.debit.toString()).toBe('14000');
    expect(totals.credit.toString()).toBe('14000');
  });

  it('posts recipe sale cost from the consumed inventory movement values', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      { totalValue: new Prisma.Decimal(5000) },
      { totalValue: new Prisma.Decimal(3000) },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({ id: 'recipe-order-1', total: new Prisma.Decimal(25000) }),
    );

    const calls = tx.accountingMovement.create.mock.calls;
    expect(calls.map(([call]: any[]) => [call.data.pucCuentaCode, call.data.nature, call.data.amount.toString()])).toEqual([
      ['1105', 'DEBIT', '25000'],
      ['4135', 'CREDIT', '25000'],
      ['6135', 'DEBIT', '8000'],
      ['1435', 'CREDIT', '8000'],
    ]);

    const totals = totalsByNature(calls);
    expect(totals.debit.toString()).toBe('33000');
    expect(totals.credit.toString()).toBe('33000');
  });

  it('posts service income and real consumed-input cost with service descriptions', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        totalValue: new Prisma.Decimal(900),
        orderItemId: null,
        reservationId: 'reservation-1',
      },
    ]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        id: 'reservation-1',
        items: [
          {
            id: 'virtual-oi-reservation-1',
            itemId: 'service-1',
            itemNameSnapshot: 'Corte de barba',
            itemTypeSnapshot: 'SERVICE',
            quantity: 1,
            price: new Prisma.Decimal(10000),
            item: { id: 'service-1', name: 'Corte de barba', type: 'SERVICE' },
          },
        ],
      }),
    );

    const calls = tx.accountingMovement.create.mock.calls;
    expect(
      calls.map(([call]: any[]) => [
        call.data.pucCuentaCode,
        call.data.nature,
        call.data.amount.toString(),
        call.data.detail,
      ]),
    ).toEqual([
      ['1105', 'DEBIT', '10000', 'Contrapartida servicio - Corte de barba'],
      ['4135', 'CREDIT', '10000', 'Ingreso por servicio - Corte de barba'],
      ['6135', 'DEBIT', '900', 'Consumo de insumos por servicio - Corte de barba'],
      ['1435', 'CREDIT', '900', 'Salida de inventario por servicio - Corte de barba'],
    ]);
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

    const calls = tx.accountingMovement.create.mock.calls;
    expect(calls.map(([call]: any[]) => call.data.detail)).toEqual([
      'Contrapartida venta mixta',
      'Ingreso por venta de producto - Producto A',
      'Ingreso por servicio - Servicio B',
      'Costo de venta de producto - Producto A',
      'Salida de inventario por venta de producto - Producto A',
      'Consumo de insumos por servicio - Servicio B',
      'Salida de inventario por servicio - Servicio B',
    ]);

    const totals = totalsByNature(calls);
    expect(totals.debit.toString()).toBe('24900');
    expect(totals.credit.toString()).toBe('24900');
  });

  it('uses the current shared income account without losing service semantics', async () => {
    const { service, tx } = createService();
    tx.inventoryMovement.findMany.mockResolvedValue([]);

    await service.postOrderMovements(
      tx,
      businessId,
      order({
        items: [
          {
            itemNameSnapshot: 'Asesoría',
            itemTypeSnapshot: 'SERVICE',
            lineTotal: new Prisma.Decimal(10000),
            item: { type: 'SERVICE' },
          },
        ],
      }),
    );

    const incomeCall = tx.accountingMovement.create.mock.calls[1][0] as any;
    expect(incomeCall.data.pucCuentaCode).toBe('4135');
    expect(incomeCall.data.detail).toBe('Ingreso por servicio - Asesoría');
  });
});
