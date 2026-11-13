import { Prisma, TaxDirection, TaxType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { AccountingService } from './accounting.service';

// Bloque 2.2: snapshots were recorded BEFORE extracting postInventoryCostMovements.
// They pin every field of every movement postOrderMovements writes, so the refactor
// (and anything later) cannot silently change sales postings.
describe('postOrderMovements golden output', () => {
  const at = new Date('2026-06-01T10:00:00.000Z');
  function setup(inventory: any[], fiscal: any = null, taxLines: any[] = []) {
    const puc = (code: string) => ({ code, name: code, grupo: null });
    const sub = (code: string) => ({ code, name: code, cuentaCode: code.slice(0, 4), active: true, cuenta: puc(code.slice(0, 4)) });
    const lookups = {
      pucCuenta: { findUnique: jest.fn(({ where }: any) => Promise.resolve(puc(where.code))) },
      pucSubcuenta: { findUnique: jest.fn(({ where }: any) => Promise.resolve(sub(where.code))) },
    };
    const tx: any = {
      ...lookups,
      inventoryMovement: { findMany: jest.fn(() => Promise.resolve(inventory)) },
      orderFiscalContext: { findUnique: jest.fn(() => Promise.resolve(fiscal)) },
      saleTaxLine: { findMany: jest.fn(() => Promise.resolve(taxLines)) },
      salesTaxRule: { findFirst: jest.fn(() => Promise.resolve(null)) },
      accountingMovement: { create: jest.fn(({ data }: any) => Promise.resolve({ id: 'm', ...data })) },
    };
    return { service: new AccountingService(lookups as any), tx };
  }
  const written = (tx: any) =>
    tx.accountingMovement.create.mock.calls.map(([{ data }]: any[]) => ({
      ...data,
      amount: data.amount.toString(),
      date: new Date(data.date).toISOString(),
    }));
  const order = (overrides: any = {}) => ({
    id: 'order-1', total: new Prisma.Decimal(20000), customerName: 'Cliente', accountingPostedAt: at, updatedAt: at, paymentMethod: 'CASH',
    items: [{ id: 'line-p', itemId: 'p1', itemNameSnapshot: 'Producto A', itemTypeSnapshot: 'PRODUCT', quantity: 1, lineTotal: new Prisma.Decimal(20000), item: { id: 'p1', name: 'Producto A', type: 'PRODUCT' } }],
    ...overrides,
  });

  it('product sale with cost', async () => {
    const { service, tx } = setup([{ totalValue: new Prisma.Decimal(4000), orderItemId: 'line-p' }]);
    await service.postOrderMovements(tx, 'b1', order() as any);
    expect(written(tx)).toMatchSnapshot();
  });

  it('service order with recipe consumption, bank transfer', async () => {
    const { service, tx } = setup([{ totalValue: new Prisma.Decimal(900), orderItemId: 'line-s' }]);
    await service.postOrderMovements(tx, 'b1', order({
      paymentMethod: 'BANK_TRANSFER', total: new Prisma.Decimal(15000),
      items: [{ id: 'line-s', itemId: 's1', itemNameSnapshot: 'Corte', itemTypeSnapshot: 'SERVICE', quantity: 1, lineTotal: new Prisma.Decimal(15000), item: { id: 's1', name: 'Corte', type: 'SERVICE' } }],
    }) as any);
    expect(written(tx)).toMatchSnapshot();
  });

  it('v1 reservation virtual order with reservation-keyed consumption', async () => {
    const { service, tx } = setup([{ totalValue: new Prisma.Decimal(1250.5), orderItemId: null, reservationId: 'res-1' }]);
    await service.postOrderMovements(tx, 'b1', {
      id: 'res-1', status: 'COMPLETED', customerName: 'Ana', paymentMethod: 'CASH', total: new Prisma.Decimal(30000), updatedAt: at, createdAt: at, origin: 'PUBLIC_STORE',
      items: [{ id: 'virtual-oi-res-1', itemId: 's1', quantity: 1, itemNameSnapshot: 'Masaje', itemTypeSnapshot: 'SERVICE', unitPrice: new Prisma.Decimal(30000), price: new Prisma.Decimal(30000), item: { id: 's1', name: 'Masaje', type: 'SERVICE' } }],
    } as any);
    expect(written(tx)).toMatchSnapshot();
  });

  it('fiscal context with withholdings, charged tax and cost', async () => {
    const { service, tx } = setup(
      [{ totalValue: new Prisma.Decimal(3000), orderItemId: 'line-p' }],
      { netReceived: new Prisma.Decimal(105500), saleConcept: 'GOODS' },
      [
        { taxType: TaxType.RETEFUENTE, direction: TaxDirection.WITHHOLD, taxAmount: new Prisma.Decimal(2500), accountCode: '135515', applied: true },
        { taxType: TaxType.IMPOCONSUMO, direction: TaxDirection.CHARGE, taxAmount: new Prisma.Decimal(8000), accountCode: '519595', applied: true },
      ],
    );
    await service.postOrderMovements(tx, 'b1', order({ total: new Prisma.Decimal(100000), items: [{ id: 'line-p', itemId: 'p1', itemNameSnapshot: 'Producto A', itemTypeSnapshot: 'PRODUCT', quantity: 1, lineTotal: new Prisma.Decimal(100000), item: { id: 'p1', name: 'Producto A', type: 'PRODUCT' } }] }) as any);
    expect(written(tx)).toMatchSnapshot();
  });
});
