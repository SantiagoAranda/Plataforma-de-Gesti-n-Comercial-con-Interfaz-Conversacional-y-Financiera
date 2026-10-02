import { SalesService } from './sales.service';

describe('ordinary sale closure with electronic invoicing available', () => {
  it('freezes consumer-final taxes before inventory and accounting without creating a fiscal document', async () => {
    const steps: string[] = [];
    const order: any = {
      id: 'sale-1', businessId: 'business-1', origin: 'PUBLIC_STORE', status: 'SENT',
      accountingPostedAt: null, inventoryPostedAt: null, taxSnapshot: null,
      items: [{ id: 'line-1', itemId: 'product-1', quantity: 1, unitPrice: 100, itemTypeSnapshot: 'PRODUCT' }],
    };
    const tx: any = {
      order: {
        findFirst: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: 'COMPLETED' }),
      },
      businessTaxProfile: { findUnique: jest.fn().mockResolvedValue({ taxSettingsEnabled: true }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)), fiscalDocument: { findFirst: jest.fn() } };
    const tax: any = {
      calculateTaxPreview: jest.fn().mockImplementation(async (_businessId: string, input: any) => {
        steps.push('calculate');
        expect(input.buyerType).toBe('NATURAL');
        expect(input.buyerDocumentNumber).toBeNull();
        return { taxLines: [] };
      }),
      freezeTaxCalculation: jest.fn().mockImplementation(async () => { steps.push('freeze'); }),
    };
    const inventory: any = { applyInventoryConsumptionForOrder: jest.fn().mockImplementation(async () => { steps.push('inventory'); return []; }) };
    const accounting: any = { postOrderMovements: jest.fn().mockImplementation(async () => { steps.push('accounting'); return []; }) };
    const fiscal: any = { captureInvoiceCloseSnapshot: jest.fn().mockImplementation(async () => { steps.push('snapshot'); }), createInvoiceIntent: jest.fn(), dispatch: jest.fn() };
    const service = new SalesService(prisma, accounting, inventory, {} as any, tax, fiscal);

    await expect(service.confirmOrder('business-1', order.id)).resolves.toMatchObject({ order: { status: 'COMPLETED' } });
    expect(steps).toEqual(['calculate', 'freeze', 'inventory', 'accounting', 'snapshot']);
    expect(fiscal.createInvoiceIntent).not.toHaveBeenCalled();
    expect(fiscal.dispatch).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.findFirst).not.toHaveBeenCalled();
  });

  it('captures a closure marker after posting even when RUT is disabled', async () => {
    const order: any = { id: 'sale-1', businessId: 'business-1', origin: 'MANUAL', status: 'DRAFT',
      accountingPostedAt: null, inventoryPostedAt: null, taxSnapshot: null,
      items: [{ id: 'line-1', itemId: 'product-1', quantity: 1, unitPrice: 100, itemTypeSnapshot: 'PRODUCT' }] };
    const tx: any = { order: { findFirst: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: 'COMPLETED' }) },
      businessTaxProfile: { findUnique: jest.fn().mockResolvedValue({ taxSettingsEnabled: false }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const tax: any = { calculateTaxPreview: jest.fn(), freezeTaxCalculation: jest.fn() };
    const fiscal: any = { captureInvoiceCloseSnapshot: jest.fn(), createInvoiceIntent: jest.fn(), dispatch: jest.fn() };
    const service = new SalesService(prisma, { postOrderMovements: jest.fn().mockResolvedValue([]) } as any,
      { applyInventoryConsumptionForOrder: jest.fn().mockResolvedValue([]) } as any, {} as any, tax, fiscal);
    await expect(service.confirmOrder('business-1', order.id)).resolves.toMatchObject({ order: { status: 'COMPLETED' } });
    expect(tax.freezeTaxCalculation).not.toHaveBeenCalled();
    expect(fiscal.captureInvoiceCloseSnapshot).toHaveBeenCalledWith(tx, 'business-1', 'sale-1');
    expect(fiscal.createInvoiceIntent).not.toHaveBeenCalled();
    expect(fiscal.dispatch).not.toHaveBeenCalled();
  });

  it('rejects an edit after confirmation wins the order lock, even if the earlier read saw DRAFT', async () => {
    const draft: any = { id: 'sale-1', businessId: 'business-1', status: 'DRAFT',
      accountingPostedAt: null, inventoryPostedAt: null, items: [{ id: 'line-1' }] };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: draft.id }]),
      order: { findFirst: jest.fn().mockResolvedValue({ ...draft, status: 'COMPLETED', accountingPostedAt: new Date() }), update: jest.fn() },
      orderItem: { delete: jest.fn() },
    };
    const prisma: any = { order: { findFirst: jest.fn().mockResolvedValue(draft) },
      orderItem: { findFirst: jest.fn().mockResolvedValue({ id: 'line-1', orderId: draft.id, businessId: draft.businessId }) },
      $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new SalesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'assertSimpleRegimeAvailableForNewSale').mockResolvedValue(undefined);
    await expect(service.removeItem('business-1', draft.id, 'line-1')).rejects.toThrow('posted');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.delete).not.toHaveBeenCalled();
  });

  it('blocks reversing an order whose electronic invoice is still pending', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'sale-1' }]),
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'sale-1', businessId: 'business-1', status: 'COMPLETED', items: [] }), update: jest.fn() },
      fiscalDocument: { findFirst: jest.fn().mockResolvedValue({ id: 'invoice-1', status: 'PENDING' }) },
      inventoryMovement: { findMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new SalesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.reverseConfirmedOrder('business-1', 'sale-1', {} as any)).rejects.toThrow('sincronizacion');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
