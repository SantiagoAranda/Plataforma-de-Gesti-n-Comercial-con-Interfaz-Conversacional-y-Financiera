import { Prisma } from '@prisma/client';
import { FiscalDocumentService } from './fiscal-document.service';
import { assertInvoiceHistory, buyerIdentityState, requiresLegacyInvoiceWarning, TAX_DISABLED_AT_CLOSE } from './invoice-close-snapshot';

describe('manual electronic invoice', () => {
  const credentials = { clientId: 'id', clientSecret: 'secret', username: 'user', password: 'password' };
  function setup(options: { status?: string; posted?: boolean; enabled?: boolean; taxEnabled?: boolean; responsibility52?: boolean; credentials?: string | null; existing?: any; business?: string } = {}) {
    const order: any = {
      id: 'sale-1', businessId: 'business-1', status: options.status ?? 'COMPLETED',
      accountingPostedAt: options.posted === false ? null : new Date(),
      inventoryPostedAt: options.posted === false ? null : new Date(),
      total: 100, items: [{ id: 'line-1' }], taxLines: [],
      fiscalContext: { subtotal: 100, chargedTaxTotal: 0, withheldTaxTotal: 0, netReceived: 100 },
      taxSnapshot: { rawCalculation: { subtotal: 100, vatTotal: 0, impoconsumoTotal: 0 } },
    };
    const document = { id: 'invoice-1', businessId: 'business-1', orderId: order.id, status: 'PENDING', type: 'INVOICE', sequenceScope: 'PRIMARY' };
    const config = { enabled: options.enabled ?? true, encryptedCredentials: options.credentials === undefined ? 'encrypted' : options.credentials };
    const tx: any = {
      business: { findUnique: jest.fn().mockResolvedValue({ status: options.business ?? 'ACTIVE' }) },
      order: { findFirst: jest.fn().mockResolvedValue(order) },
      fiscalDocument: { findFirst: jest.fn().mockResolvedValue(options.existing ?? null) },
      factusConfiguration: { findUnique: jest.fn().mockResolvedValue(config) },
      businessTaxProfile: { findUnique: jest.fn().mockResolvedValue({ taxSettingsEnabled: options.taxEnabled ?? true, responsibilities: options.responsibility52 === false ? [] : [{ responsibility: { code: '52' } }] }) },
    };
    const prisma: any = {
      business: { findUnique: jest.fn().mockResolvedValue({ status: options.business ?? 'ACTIVE' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
      fiscalDocument: { findFirst: jest.fn().mockResolvedValue(options.existing ?? document) },
      factusConfiguration: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const provider: any = { decryptCredentials: jest.fn().mockReturnValue(credentials), encryptCredentials: jest.fn().mockReturnValue('encrypted') };
    const service = new FiscalDocumentService(prisma, provider, {} as any);
    const create = jest.spyOn(service, 'createInvoiceIntent').mockResolvedValue(document as any);
    const dispatch = jest.spyOn(service, 'dispatch').mockResolvedValue({ ...document, status: 'VALIDATED' } as any);
    return { service, prisma, tx, provider, create, dispatch, document, order };
  }

  function versionedOrder() {
    const order = setup().order;
    order.items = [{ id: 'line-1', itemId: 'product-1', quantity: 1, unitPrice: 100 }];
    order.taxSnapshot.buyerFiscal = { buyerType: 'NATURAL', buyerName: null, buyerDocumentNumber: null };
    order.taxSnapshot.rawCalculation.invoiceCloseSnapshot = {
      version: 2, capturedAt: '2026-09-30T00:00:00Z', fiscalState: 'TAX_CALCULATED',
      taxSettingsEnabled: true, buyerState: 'CONSUMER_FINAL',
      seller: { nit: '900000001' },
      buyer: { identification_document_code: '13', identification: '22222222222', names: 'Consumidor Final' },
      items: [{ code_reference: 'product-1', name: 'Producto', price: '100.00', quantity: '1.00',
        discount_rate: '0.00', unit_measure_code: '94', standard_code: '999', taxes: [] }],
      orderItemIds: ['line-1'], payment: { amount: '100.00', payment_form: '1', payment_method_code: '10' }, total: 100,
    };
    return order;
  }

  it('distinguishes no buyer, a complete company, and an incomplete declared buyer', () => {
    expect(buyerIdentityState({ buyerType: 'NATURAL', buyerName: null, buyerDocumentNumber: null })).toBe('CONSUMER_FINAL');
    expect(buyerIdentityState({ buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentNumber: '900123456' })).toBe('IDENTIFIED');
    expect(buyerIdentityState({ buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentNumber: null })).toBe('EXPLICIT_INCOMPLETE');
    expect(buyerIdentityState({ buyerType: 'NATURAL', buyerName: 'Ana', buyerDocumentNumber: null })).toBe('EXPLICIT_INCOMPLETE');
    const { service } = setup();
    const fiscal = { buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentNumber: '900123456', buyerDocumentType: 'NIT' };
    const order: any = { items: [{ id: 'line-1', itemId: 'product-1', itemNameSnapshot: 'Producto', quantity: 1, unitPrice: 100,
      item: {} }], taxLines: [], fiscalContext: fiscal, total: 100, paymentMethod: 'CASH',
      business: { taxProfile: { nit: '900001', responsibilities: [] } }, taxSnapshot: { rawCalculation: {} } };
    const complete = (service as any).buildSnapshots(order, {});
    expect(complete.buyer).toMatchObject({ identification: '900123456', company: 'Empresa' });
    order.fiscalContext = { ...fiscal, buyerDocumentNumber: null };
    expect((service as any).buildSnapshots(order, {}, { allowIncompleteBuyer: true }).buyer).toBeNull();
    expect(() => (service as any).buildSnapshots(order, {})).toThrow('comprador informado');
    order.fiscalContext = { buyerType: 'NATURAL', buyerName: null, buyerDocumentNumber: null };
    expect((service as any).buildSnapshots(order, {}).buyer.identification).toBe('22222222222');
  });

  it('closes a sale with an incomplete declared company without disguising it as consumer final', async () => {
    const { service, order } = setup();
    order.business = { taxProfile: { taxSettingsEnabled: true, nit: '900001', responsibilities: [] } };
    order.items = [{ id: 'line-1', itemId: 'product-1', itemNameSnapshot: 'Producto', quantity: 1,
      unitPrice: 100, item: {} }];
    order.fiscalContext = { subtotal: 100, chargedTaxTotal: 0, withheldTaxTotal: 0, netReceived: 100,
      buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentType: 'NIT', buyerDocumentNumber: null };
    order.taxSnapshot.buyerFiscal = { buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentNumber: null };
    const tx: any = { order: { findFirst: jest.fn().mockResolvedValue(order) },
      factusConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
      taxCalculationSnapshot: { update: jest.fn() } };
    await expect(service.captureInvoiceCloseSnapshot(tx, 'business-1', 'sale-1')).resolves.toBeUndefined();
    const close = tx.taxCalculationSnapshot.update.mock.calls[0][0].data.rawCalculation.invoiceCloseSnapshot;
    expect(close).toMatchObject({ buyerState: 'EXPLICIT_INCOMPLETE', buyer: null, fiscalState: 'TAX_CALCULATED' });
    order.taxSnapshot.rawCalculation.invoiceCloseSnapshot = close;
    expect(() => assertInvoiceHistory(order)).toThrow('comprador informado');
  });

  it('rejects an explicitly declared company without NIT before creating a document', async () => {
    const { service, order, create, dispatch } = setup();
    order.fiscalContext.buyerType = 'JURIDICA';
    order.fiscalContext.buyerName = 'Empresa';
    order.fiscalContext.buyerDocumentNumber = null;
    order.taxSnapshot.buyerFiscal = { buyerType: 'JURIDICA', buyerName: 'Empresa', buyerDocumentNumber: null };
    order.taxSnapshot.rawCalculation.invoiceCloseSnapshot = versionedOrder().taxSnapshot.rawCalculation.invoiceCloseSnapshot;
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('comprador informado');
    expect(create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rechecks business activity and Factus permission before creating the intent', async () => {
    const inactive = setup();
    inactive.tx.business.findUnique.mockResolvedValue({ status: 'INACTIVE' });
    await expect(inactive.service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('negocio no está activo');
    expect(inactive.create).not.toHaveBeenCalled();
    const suspended = setup();
    suspended.tx.factusConfiguration.findUnique.mockResolvedValue({ enabled: false, encryptedCredentials: 'encrypted' });
    await expect(suspended.service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('habilitada');
    expect(suspended.create).not.toHaveBeenCalled();
  });

  it.each([
    ['Factus disabled', 'ACTIVE', false, 'deshabilitado'],
    ['business inactive', 'INACTIVE', true, 'negocio no está activo'],
  ])('does not claim a document after %s before dispatch', async (_case, businessStatus, enabled, message) => {
    const document: any = { id: 'invoice-1', businessId: 'business-1', orderId: 'sale-1', type: 'INVOICE', status: 'PENDING',
      order: { status: 'COMPLETED', accountingPostedAt: new Date(), inventoryPostedAt: new Date(), taxLines: [] },
      business: { status: businessStatus, factusConfiguration: { enabled, encryptedCredentials: 'encrypted' } } };
    const tx: any = { fiscalDocument: { findFirst: jest.fn().mockResolvedValue(document), updateMany: jest.fn() },
      fiscalDocumentAttempt: { create: jest.fn() } };
    const prisma: any = { fiscalDocument: { findFirst: jest.fn(({ where }: any) => where.type ? { order: { taxLines: [] } } : document) },
      $transaction: jest.fn((callback: any) => callback(tx)) };
    const provider: any = { decryptCredentials: jest.fn(), validateInvoice: jest.fn() };
    const service = new FiscalDocumentService(prisma, provider, {} as any);
    await expect(service.dispatch('business-1', document.id)).rejects.toThrow(message);
    expect(tx.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalDocumentAttempt.create).not.toHaveBeenCalled();
    expect(provider.validateInvoice).not.toHaveBeenCalled();
  });

  it.each([
    ['Factus suspension', 'ACTIVE', false, 'no está habilitado'],
    ['business deactivation', 'INACTIVE', true, 'negocio no está activo'],
  ])('rechecks %s before creating a credit note', async (_case, businessStatus, enabled, message) => {
    const invoice: any = { id: 'invoice-1', businessId: 'business-1', orderId: 'sale-1', type: 'INVOICE',
      status: 'VALIDATED', factusNumber: 'FE-123', paymentSnapshot: { amount: '100.00', payment_form: '1', payment_method_code: '10' } };
    const tx: any = { business: { findUnique: jest.fn().mockResolvedValue({ status: businessStatus }) },
      factusConfiguration: { findUnique: jest.fn().mockResolvedValue({ enabled }) },
      fiscalDocument: { updateMany: jest.fn(), create: jest.fn() } };
    const prisma: any = { fiscalDocument: { findFirst: jest.fn().mockResolvedValueOnce(invoice).mockResolvedValueOnce(null) },
      $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new FiscalDocumentService(prisma, {} as any, {} as any);
    jest.spyOn(service, 'dispatch').mockResolvedValue({} as any);
    await expect(service.requestCreditNote('business-1', invoice.id, '2')).rejects.toThrow(message);
    expect(tx.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalDocument.create).not.toHaveBeenCalled();
    expect(service.dispatch).not.toHaveBeenCalled();
  });

  it('requires every consumed v2 field and accepts a legitimate zero', () => {
    expect(() => assertInvoiceHistory(versionedOrder())).not.toThrow();
    const corruptions: Array<[string, (close: any) => void]> = [
      ['missing price', (close) => { delete close.items[0].price; }],
      ['null quantity', (close) => { close.items[0].quantity = null; }],
      ['wrong payment type', (close) => { close.payment.payment_method_code = 10; }],
      ['nonfinite total', (close) => { close.total = 'Infinity'; }],
      ['missing unit code', (close) => { delete close.items[0].unit_measure_code; }],
      ['missing document code', (close) => { delete close.buyer.identification_document_code; }],
      ['wrong document code', (close) => { close.buyer.identification_document_code = '31'; }],
      ['missing tax rate', (close) => { close.items[0].taxes = [{ code: '01', rate: null }]; }],
      ['missing line link', (close) => { close.orderItemIds = []; }],
      ['null payment amount', (close) => { close.payment.amount = null; }],
      ['null line', (close) => { close.items[0] = null; }],
    ];
    for (const [label, mutate] of corruptions) {
      const order = versionedOrder();
      mutate(order.taxSnapshot.rawCalculation.invoiceCloseSnapshot);
      expect(() => assertInvoiceHistory(order)).toThrow('snapshot fiscal de cierre');
    }
    const zero = versionedOrder();
    expect(zero.taxSnapshot.rawCalculation.vatTotal).toBe(0);
    expect(zero.taxSnapshot.rawCalculation.invoiceCloseSnapshot.items[0].discount_rate).toBe('0.00');
    expect(() => assertInvoiceHistory(zero)).not.toThrow();
  });

  it('checks frozen tax rates against the recorded order line', () => {
    const order = versionedOrder();
    order.fiscalContext.chargedTaxTotal = 19;
    order.taxSnapshot.rawCalculation.vatTotal = 19;
    order.taxLines = [{ orderItemId: 'line-1', applied: true, direction: 'CHARGE', taxType: 'IVA', rate: 0.19, taxAmount: 19 }];
    const close = order.taxSnapshot.rawCalculation.invoiceCloseSnapshot;
    close.total = 119;
    close.payment.amount = '119.00';
    close.items[0].taxes = [{ code: '01', rate: '19.00' }];
    expect(() => assertInvoiceHistory(order)).not.toThrow();
    close.items[0].taxes[0].rate = '0.00';
    expect(() => assertInvoiceHistory(order)).toThrow('snapshot fiscal de cierre');
  });

  it('marks a RUT-disabled closure as v2 without inventing fiscal data and blocks later issuance', async () => {
    const { service, order, create, dispatch } = setup();
    order.business = { taxProfile: { taxSettingsEnabled: false } };
    order.fiscalContext = null;
    order.taxSnapshot = null;
    const tx: any = { order: { findFirst: jest.fn().mockResolvedValue(order) },
      taxCalculationSnapshot: { create: jest.fn().mockImplementation(({ data }: any) => {
        order.taxSnapshot = { rawCalculation: data.rawCalculation, buyerFiscal: data.buyerFiscal };
        return order.taxSnapshot;
      }) } };
    await service.captureInvoiceCloseSnapshot(tx, 'business-1', 'sale-1');
    const close = order.taxSnapshot.rawCalculation.invoiceCloseSnapshot;
    expect(close).toMatchObject({ version: 2, fiscalState: TAX_DISABLED_AT_CLOSE,
      taxSettingsEnabled: false, seller: null, buyer: null, items: null });
    expect(requiresLegacyInvoiceWarning(order.taxSnapshot.rawCalculation)).toBe(false);
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('configuración fiscal deshabilitada');
    expect(create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('creates one primary intent after closure and dispatches after commit', async () => {
    const { service, prisma, create, dispatch, document } = setup();
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).resolves.toMatchObject({ status: 'VALIDATED' });
    expect(create).toHaveBeenCalledWith(expect.anything(), 'business-1', 'sale-1');
    expect(dispatch).toHaveBeenCalledWith('business-1', document.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['DRAFT', 'SENT', 'CANCELLED'])('rejects %s orders before fiscal writes', async (status) => {
    const { service, create, dispatch } = setup({ status });
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('finalizada');
    expect(create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects incomplete posting', async () => {
    const { service, create } = setup({ posted: false });
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('finalizada');
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [{ enabled: false }, 'habilitada'],
    [{ taxEnabled: false }, 'habilitada'],
    [{ responsibility52: false }, 'habilitada'],
    [{ credentials: null }, 'credenciales'],
  ])('rejects unavailable configuration %j', async (options, message) => {
    const { service, create } = setup(options);
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow(message);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects missing tenant and another business sale', async () => {
    const { service, tx, create } = setup();
    await expect(service.generateInvoiceForSale('', 'sale-1')).rejects.toThrow('contexto');
    tx.order.findFirst.mockResolvedValueOnce(null);
    await expect(service.generateInvoiceForSale('business-1', 'other-sale')).rejects.toThrow('no encontrada');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns an existing rejected invoice without a new intent or dispatch', async () => {
    const existing = { id: 'rejected-1', status: 'REJECTED', type: 'INVOICE' };
    const { service, create, dispatch } = setup({ existing, enabled: false });
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).resolves.toBe(existing);
    expect(create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('recovers the winning primary invoice after a unique conflict without dispatching twice', async () => {
    const { service, create, dispatch, document } = setup();
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6.19.2' }));
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).resolves.toEqual(document);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('retries a serialization conflict when no request has committed the primary invoice yet', async () => {
    const { service, prisma, create } = setup();
    prisma.fiscalDocument.findFirst.mockResolvedValueOnce(null);
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Serialization', { code: 'P2034', clientVersion: '6.19.2' }));
    await expect(service.generateInvoiceForSale('business-1', 'sale-1')).resolves.toMatchObject({ status: 'VALIDATED' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('preserves administrative permission and an omitted environment on technical update', async () => {
    const { service, prisma } = setup();
    await service.configure('business-1', { enabled: true, invoiceRangeId: 19 });
    expect(prisma.factusConfiguration.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ enabled: false, environment: 'sandbox' }),
      update: expect.objectContaining({ environment: undefined, invoiceRangeId: 19 }),
    }));
    expect(prisma.factusConfiguration.upsert.mock.calls[0][0].update.enabled).toBeUndefined();
  });

  it('marks only versioned closures as new and rejects missing fiscal history', () => {
    expect(requiresLegacyInvoiceWarning({})).toBe(true);
    expect(requiresLegacyInvoiceWarning({ invoiceCloseSnapshot: { version: 2 } })).toBe(false);
    expect(() => assertInvoiceHistory({ items: [], taxLines: [] })).toThrow('información fiscal necesaria');
  });

  it('writes the version marker and frozen values into the existing calculation snapshot at closure', async () => {
    const { service, order } = setup();
    order.business = { taxProfile: { taxSettingsEnabled: true } };
    const snapshots = { seller: { nit: '900001' }, buyer: { identification: '22222222222' },
      items: [{ code_reference: 'item-1' }], payment: { amount: '100.00' }, total: 100 };
    jest.spyOn(service as any, 'buildSnapshots').mockReturnValue(snapshots);
    const tx: any = { order: { findFirst: jest.fn().mockResolvedValue(order) },
      factusConfiguration: { findUnique: jest.fn().mockResolvedValue(null) },
      taxCalculationSnapshot: { update: jest.fn().mockResolvedValue({}) } };
    await service.captureInvoiceCloseSnapshot(tx, 'business-1', 'sale-1');
    const raw = tx.taxCalculationSnapshot.update.mock.calls[0][0].data.rawCalculation;
    expect(raw.invoiceCloseSnapshot).toMatchObject({ version: 2, seller: snapshots.seller,
      buyer: snapshots.buyer, items: snapshots.items, payment: snapshots.payment,
      orderItemIds: ['line-1'], taxSettingsEnabled: true,
      fiscalState: 'TAX_CALCULATED', buyerState: 'CONSUMER_FINAL' });
    expect(raw.invoiceCloseSnapshot.capturedAt).toEqual(expect.any(String));
  });

  it('lets a legacy sale with sufficient historical amounts proceed but blocks missing snapshots', async () => {
    const valid = setup();
    await expect(valid.service.generateInvoiceForSale('business-1', 'sale-1')).resolves.toMatchObject({ status: 'VALIDATED' });
    const incomplete = setup();
    incomplete.order.taxSnapshot = null;
    await expect(incomplete.service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('información fiscal necesaria');
    expect(incomplete.create).not.toHaveBeenCalled();
    const missingCalculation = setup();
    missingCalculation.order.taxSnapshot.rawCalculation = {};
    await expect(missingCalculation.service.generateInvoiceForSale('business-1', 'sale-1')).rejects.toThrow('cálculo tributario necesario');
  });

  it('uses the versioned seller, buyer, lines and payment after current configuration changes', () => {
    const { service } = setup();
    const close = {
      version: 2, capturedAt: '2026-09-30T00:00:00Z',
      taxSettingsEnabled: true, fiscalState: 'TAX_CALCULATED', buyerState: 'CONSUMER_FINAL',
      seller: { nit: '900000001', tradeName: 'Vendedor histórico' },
      buyer: { identification_document_code: '13', identification: '22222222222', names: 'Consumidor Final' },
      items: [{ code_reference: 'product-1', name: 'Producto histórico', price: '100.00', quantity: '1.00', discount_rate: '0.00', unit_measure_code: '94', standard_code: '999', taxes: [] }],
      orderItemIds: ['line-1'],
      payment: { amount: '100.00', payment_form: '1', payment_method_code: '10' }, total: 100,
    };
    const order = {
      total: 100, paymentMethod: 'BANK_TRANSFER',
      fiscalContext: { subtotal: 100, chargedTaxTotal: 0, withheldTaxTotal: 0, netReceived: 100 },
      taxLines: [], taxSnapshot: { buyerFiscal: { buyerType: 'NATURAL', buyerName: null, buyerDocumentNumber: null },
        rawCalculation: { subtotal: 100, vatTotal: 0, impoconsumoTotal: 0, invoiceCloseSnapshot: close } },
      items: [{ id: 'line-1', itemId: 'product-1', quantity: 1, unitPrice: 100 }],
      business: { taxProfile: { nit: '900999999', tradeName: 'Vendedor nuevo' } },
    };
    expect(() => assertInvoiceHistory(order)).not.toThrow();
    const snapshots = (service as any).buildSnapshots(order, { invoiceRangeId: 39, defaultPaymentMethod: '42' });
    expect(snapshots.seller.nit).toBe('900000001');
    expect(snapshots.buyer.identification).toBe('22222222222');
    expect(snapshots.items[0].name).toBe('Producto histórico');
    expect(snapshots.payment.payment_method_code).toBe('10');
    expect(snapshots.payload.numbering_range_id).toBe(39);
  });

  it('does not reinterpret a sale closed with taxes disabled as an untaxed electronic invoice', () => {
    const order = setup().order;
    order.taxSnapshot.rawCalculation = { subtotal: 100, vatTotal: 0, impoconsumoTotal: 0,
      invoiceCloseSnapshot: { version: 2, taxSettingsEnabled: false } };
    expect(() => assertInvoiceHistory(order)).toThrow('configuración fiscal deshabilitada');
  });

  it('leaves a pending document unchanged when Factus is administratively disabled', async () => {
    const document: any = { id: 'invoice-1', businessId: 'business-1', orderId: 'sale-1', type: 'INVOICE', status: 'PENDING',
      order: { status: 'COMPLETED', accountingPostedAt: new Date(), inventoryPostedAt: new Date(), taxLines: [] },
      business: { status: 'ACTIVE', factusConfiguration: { enabled: false, encryptedCredentials: 'encrypted' } } };
    const tx: any = { fiscalDocument: { findFirst: jest.fn().mockResolvedValue(document), updateMany: jest.fn() },
      fiscalDocumentAttempt: { create: jest.fn() } };
    const prisma: any = { fiscalDocument: { findFirst: jest.fn(({ where }: any) => where.type ? { order: { taxLines: [] } } : document) },
      $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new FiscalDocumentService(prisma, {} as any, {} as any);
    await expect(service.dispatch('business-1', document.id)).rejects.toThrow('deshabilitado');
    expect(document.status).toBe('PENDING');
    expect(tx.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalDocumentAttempt.create).not.toHaveBeenCalled();
  });

  it('refuses unscoped fiscal history reads', async () => {
    const { service, prisma } = setup();
    await expect(service.list(undefined as any)).rejects.toThrow('contexto del negocio');
    expect(prisma.fiscalDocument.findFirst).not.toHaveBeenCalled();
  });

  it('lists existing documents without checking current Factus permission or responsibility 52', async () => {
    const { service, prisma } = setup({ enabled: false, responsibility52: false });
    const historical = [{ id: 'invoice-1', status: 'VALIDATED' }];
    prisma.fiscalDocument.findMany = jest.fn().mockResolvedValue(historical);
    prisma.factusConfiguration.findUnique = jest.fn();
    await expect(service.list('business-1')).resolves.toEqual(historical);
    expect(prisma.fiscalDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business-1' } }));
    expect(prisma.factusConfiguration.findUnique).not.toHaveBeenCalled();
  });
});
