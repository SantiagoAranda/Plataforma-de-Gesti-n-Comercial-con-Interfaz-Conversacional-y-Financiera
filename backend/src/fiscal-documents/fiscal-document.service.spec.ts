import { FiscalDocumentService } from './fiscal-document.service';
import { FiscalDocumentRecoveryService } from './fiscal-document-recovery.service';
import { NotFoundException } from '@nestjs/common';

describe('FiscalDocumentService safe read contracts', () => {
  it('lists only the owned business with safe artifact and order fields', async () => {
    const prisma: any = {
      fiscalDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FiscalDocumentService(prisma, {} as any, {} as any);

    await service.list('business-1');

    expect(prisma.fiscalDocument.findMany).toHaveBeenCalledWith({
      where: { businessId: 'business-1' },
      include: expect.objectContaining({
        artifacts: {
          select: {
            id: true,
            kind: true,
            checksum: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        order: {
          select: {
            id: true,
            customerName: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
      }),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns configuration status without exposing encrypted credentials', async () => {
    const prisma: any = {
      factusConfiguration: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          environment: 'sandbox',
          encryptedCredentials: 'ciphertext',
          invoiceRangeId: 389,
          creditNoteRangeId: 1776,
          updatedAt: new Date('2026-09-10T12:00:00Z'),
        }),
      },
    };
    const service = new FiscalDocumentService(prisma, {} as any, {} as any);

    await expect(service.getConfiguration('business-1')).resolves.toEqual({
      enabled: true,
      configured: true,
      environment: 'sandbox',
      invoiceRangeId: 389,
      creditNoteRangeId: 1776,
      updatedAt: new Date('2026-09-10T12:00:00Z'),
      lastVerifiedAt: null,
    });
    expect(prisma.factusConfiguration.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'business-1' },
        select: expect.not.objectContaining({ encryptedCredentials: false }),
      }),
    );
    expect(JSON.stringify(await service.getConfiguration('business-1'))).not.toContain('ciphertext');
  });

  it('downloads an artifact only through a business-scoped lookup', async () => {
    const prisma: any = {
      fiscalDocumentArtifact: {
        findFirst: jest.fn().mockResolvedValue({ objectKey: 'private/key.pdf' }),
      },
    };
    const storage: any = {
      downloadObject: jest.fn().mockResolvedValue({
        body: Buffer.from('pdf'),
        contentType: 'application/pdf',
      }),
    };
    const service = new FiscalDocumentService(prisma, {} as any, storage);

    const result = await service.downloadArtifact('business-1', 'document-1', 'pdf');

    expect(prisma.fiscalDocumentArtifact.findFirst).toHaveBeenCalledWith({
      where: {
        fiscalDocumentId: 'document-1',
        kind: 'pdf',
        fiscalDocument: { businessId: 'business-1' },
      },
      select: { objectKey: true },
    });
    expect(result).toEqual(expect.objectContaining({ filename: 'document-1.pdf' }));
    expect(result).not.toHaveProperty('objectKey');
  });

  it.each(['pdf', 'exe'])(
    'uses the same 404 for a missing or invalid %s artifact request',
    async (kind) => {
      const prisma: any = {
        fiscalDocumentArtifact: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new FiscalDocumentService(prisma, {} as any, {} as any);
      await expect(
        service.downloadArtifact('business-b', 'document-a', kind),
      ).rejects.toEqual(
        new NotFoundException('Documento fiscal o archivo no encontrado'),
      );
    },
  );

  it('uses the generic 404 when the private object is missing from storage', async () => {
    const prisma: any = {
      fiscalDocumentArtifact: {
        findFirst: jest.fn().mockResolvedValue({ objectKey: 'missing.pdf' }),
      },
    };
    const storage: any = {
      downloadObject: jest.fn().mockRejectedValue({ name: 'NoSuchKey' }),
    };
    const service = new FiscalDocumentService(prisma, {} as any, storage);

    await expect(
      service.downloadArtifact('business-1', 'document-1', 'pdf'),
    ).rejects.toEqual(
      new NotFoundException('Documento fiscal o archivo no encontrado'),
    );
  });
});

describe('FiscalDocumentService artifacts', () => {
  const document = {
    id: 'document-1',
    businessId: 'business-1',
    factusNumber: 'SETP1',
    type: 'INVOICE',
  };
  const configuration = { environment: 'sandbox' };

  function setup() {
    const prisma: any = {
      fiscalDocumentArtifact: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const provider: any = { download: jest.fn() };
    const storage: any = {
      uploadObject: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new FiscalDocumentService(prisma, provider, storage),
      prisma,
      provider,
      storage,
    };
  }

  it('persists PDF and XML for valid normalized downloads', async () => {
    const { service, prisma, provider, storage } = setup();
    provider.download
      .mockResolvedValueOnce({
        base64: Buffer.from('pdf').toString('base64'),
        contentType: 'application/pdf',
        extension: 'pdf',
      })
      .mockResolvedValueOnce({
        base64: Buffer.from('xml').toString('base64'),
        contentType: 'application/xml',
        extension: 'xml',
      });

    await (service as any).persistArtifacts(document, configuration, {});

    expect(storage.uploadObject).toHaveBeenCalledTimes(2);
    expect(prisma.fiscalDocumentArtifact.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.fiscalDocumentArtifact.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          fiscalDocumentId_kind: {
            fiscalDocumentId: 'document-1',
            kind: 'pdf',
          },
        },
      }),
    );
  });

  it('continues with XML when PDF is missing or invalid', async () => {
    const { service, prisma, provider, storage } = setup();
    provider.download
      .mockResolvedValueOnce({
        base64: '',
        contentType: 'application/pdf',
        extension: 'pdf',
      })
      .mockResolvedValueOnce({
        base64: `data:application/xml;base64,${Buffer.from('xml').toString('base64')}`,
        contentType: 'application/xml',
        extension: 'xml',
      });

    await (service as any).persistArtifacts(document, configuration, {});

    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
    expect(prisma.fiscalDocumentArtifact.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.fiscalDocumentArtifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fiscalDocumentId_kind: {
            fiscalDocumentId: 'document-1',
            kind: 'xml',
          },
        },
      }),
    );
  });

  it('does not create an artifact for invalid Base64', async () => {
    const { service, prisma, provider, storage } = setup();
    provider.download.mockResolvedValue({
      base64: 'not-base64!',
      contentType: 'application/pdf',
      extension: 'pdf',
    });

    await (service as any).persistArtifacts(document, configuration, {});

    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(prisma.fiscalDocumentArtifact.upsert).not.toHaveBeenCalled();
  });

  it('keeps the validated document when storage fails', async () => {
    const prisma: any = {
      fiscalDocument: {
        findFirst: jest.fn(({ where }: any) => {
          if (where.type === 'INVOICE') return { order: { taxLines: [] } };
          return {
            ...document,
            payloadSnapshot: {},
            business: {
              factusConfiguration: {
                enabled: true,
                encryptedCredentials: 'encrypted',
                environment: 'sandbox',
              },
            },
          };
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...document,
          payloadSnapshot: {},
          business: {
            factusConfiguration: {
              enabled: true,
              encryptedCredentials: 'encrypted',
              environment: 'sandbox',
            },
          },
        }),
      },
      fiscalDocumentAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          fiscalDocumentAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          fiscalDocument: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirst: jest
              .fn()
              .mockResolvedValue({ ...document, status: 'VALIDATED' }),
          },
        }),
      ),
      fiscalDocumentArtifact: { upsert: jest.fn() },
    };
    const provider: any = {
      decryptCredentials: jest.fn().mockReturnValue({}),
      validateInvoice: jest
        .fn()
        .mockResolvedValue({ data: { is_validated: true, number: 'SETP1' } }),
      download: jest.fn().mockResolvedValue({
        base64: Buffer.from('file').toString('base64'),
        contentType: 'application/pdf',
        extension: 'pdf',
      }),
    };
    const storage: any = {
      uploadObject: jest.fn().mockRejectedValue(new Error('R2 unavailable')),
    };
    const service = new FiscalDocumentService(prisma, provider, storage);

    await expect(
      service.dispatch('business-1', 'document-1'),
    ).resolves.toMatchObject({ status: 'VALIDATED' });

    expect(prisma.fiscalDocument.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is idempotent through the artifact unique upsert when run twice', async () => {
    const { service, prisma, provider } = setup();
    provider.download.mockResolvedValue({
      base64: Buffer.from('file').toString('base64'),
      contentType: 'application/octet-stream',
      extension: 'pdf',
    });

    await (service as any).persistArtifacts(document, configuration, {});
    await (service as any).persistArtifacts(document, configuration, {});

    expect(prisma.fiscalDocumentArtifact.upsert).toHaveBeenCalledTimes(4);
    for (const [input] of prisma.fiscalDocumentArtifact.upsert.mock.calls) {
      expect(input.update).toEqual({});
    }
  });
});

describe('FiscalDocumentService item tax snapshots', () => {
  const service = new FiscalDocumentService({} as any, {} as any, {} as any);
  const configuration = {
    defaultPaymentForm: '1',
    defaultPaymentMethod: '10',
    invoiceRangeId: 389,
  };

  const order = {
    total: '1000000.00',
    paymentMethod: 'CASH',
    fiscalContext: {
      subtotal: '1000000.00',
      chargedTaxTotal: '91000.00',
      withheldTaxTotal: '0.00',
      netReceived: '1091000.00',
    },
    business: {
      taxProfile: {
        nit: '900000001',
        responsibilities: [],
      },
    },
    items: [
      {
        id: 'order-item-hamburguesa',
        itemId: 'item-hamburguesa',
        itemNameSnapshot: 'Hamburguesa test',
        quantity: 1,
        unitPrice: '900000.00',
        item: { factusUnitMeasureCode: '94', factusStandardCode: '999' },
      },
      {
        id: 'order-item-llaveros',
        itemId: 'item-llaveros',
        itemNameSnapshot: 'Llaveros',
        quantity: 1,
        unitPrice: '100000.00',
        item: { factusUnitMeasureCode: '94', factusStandardCode: '999' },
      },
    ],
    taxLines: [
      {
        orderItemId: 'order-item-hamburguesa',
        taxType: 'IMPOCONSUMO',
        direction: 'CHARGE',
        applied: true,
        rate: '0.08',
        baseAmount: '900000.00',
        taxAmount: '72000.00',
      },
      {
        orderItemId: 'order-item-llaveros',
        taxType: 'IVA',
        direction: 'CHARGE',
        applied: true,
        rate: '0.19',
        baseAmount: '100000.00',
        taxAmount: '19000.00',
      },
    ],
  };

  it('maps each applied charge tax only to its historical order item', () => {
    const snapshots = (service as any).buildSnapshots(order, configuration);

    expect(snapshots.items).toEqual([
      expect.objectContaining({ taxes: [{ code: '04', rate: '8.00' }] }),
      expect.objectContaining({ taxes: [{ code: '01', rate: '19.00' }] }),
    ]);
    expect(snapshots.payload.items).toEqual(snapshots.items);
    expect(snapshots.payment.amount).toBe('1091000.00');
    expect(snapshots.total.toString()).toBe('1091000');
    expect(snapshots.items.map((item) => item.code_reference)).toEqual([
      'item-hamburguesa',
      'item-llaveros',
    ]);
  });

  it('uses the historical item id even when an item retains a legacy fiscalCode', () => {
    const legacyCodeOrder = {
      ...order,
      items: [{ ...order.items[0], item: { ...order.items[0].item, fiscalCode: ' hab-001 ' } }],
      taxLines: [order.taxLines[0]],
    };

    const snapshots = (service as any).buildSnapshots(legacyCodeOrder, configuration);

    expect(snapshots.items[0].code_reference).toBe('item-hamburguesa');
    expect(snapshots.payload.items[0].code_reference).toBe('item-hamburguesa');
  });

  it('rejects a charge tax without an order item relationship', () => {
    const legacyOrder = {
      ...order,
      taxLines: [{ ...order.taxLines[0], orderItemId: null }],
    };

    expect(() => (service as any).buildSnapshots(legacyOrder, configuration)).toThrow(
      'La factura tiene impuestos IVA o Impoconsumo sin trazabilidad por item de orden',
    );
  });

  it.each([
    ['the RUT is off despite responsibility 52 and enabled historical Factus configuration', ['52'], true, false],
    ['responsibility 52 is absent despite an enabled Factus configuration', [], true, true],
    ['Factus is disabled despite responsibility 52', ['52'], false, true],
  ])(
    'keeps the sale local when %s',
    async (_caseName, responsibilityCodes, factusEnabled, taxSettingsEnabled) => {
      const tx: any = {
        factusConfiguration: { findUnique: jest.fn().mockResolvedValue({ enabled: factusEnabled }) },
        businessTaxProfile: {
          findUnique: jest.fn().mockResolvedValue({
            taxSettingsEnabled,
            responsibilities: responsibilityCodes.map((code) => ({ responsibility: { code } })),
          }),
        },
        fiscalDocument: { findFirst: jest.fn(), create: jest.fn() },
        order: { findFirst: jest.fn() },
      };

      await expect(
        service.createInvoiceIntent(tx, 'business-1', 'order-1'),
      ).resolves.toBeNull();

      expect(tx.order.findFirst).not.toHaveBeenCalled();
      expect(tx.fiscalDocument.findFirst).not.toHaveBeenCalled();
      expect(tx.fiscalDocument.create).not.toHaveBeenCalled();
    },
  );

  it('creates an electronic intent for a legacy item without fiscalCode', async () => {
    const tx: any = {
      factusConfiguration: {
        findUnique: jest.fn().mockResolvedValue({ ...configuration, enabled: true }),
      },
      businessTaxProfile: {
        findUnique: jest.fn().mockResolvedValue({
          taxSettingsEnabled: true,
          responsibilities: [{ responsibility: { code: '52' } }],
        }),
      },
      fiscalDocument: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'invoice-1' }) },
      order: {
        findFirst: jest.fn().mockResolvedValue({
          ...order,
          items: [{ ...order.items[0], item: { ...order.items[0].item, fiscalCode: null } }],
        }),
      },
    };

    await expect(service.createInvoiceIntent(tx, 'business-1', 'order-1')).resolves.toEqual({ id: 'invoice-1' });
    expect(tx.fiscalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemsSnapshot: expect.arrayContaining([
            expect.objectContaining({ code_reference: 'item-hamburguesa' }),
          ]),
        }),
      }),
    );
  });
});

describe('FiscalDocumentService legacy tax traceability', () => {
  it('blocks a retryable legacy invoice before claiming PROCESSING', async () => {
    const prisma: any = {
      fiscalDocument: {
        findFirst: jest.fn().mockResolvedValue({
          order: {
            taxLines: [
              {
                applied: true,
                direction: 'CHARGE',
                taxType: 'IVA',
                orderItemId: null,
              },
            ],
          },
        }),
        updateMany: jest.fn(),
      },
      fiscalDocumentAttempt: { create: jest.fn() },
    };
    const provider: any = { validateInvoice: jest.fn() };
    const service = new FiscalDocumentService(prisma, provider, {} as any);

    await expect(service.dispatch('business-1', 'document-1')).rejects.toThrow(
      'La factura tiene impuestos IVA o Impoconsumo sin trazabilidad por item de orden',
    );
    expect(prisma.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocumentAttempt.create).not.toHaveBeenCalled();
    expect(provider.validateInvoice).not.toHaveBeenCalled();
  });
});

describe('FiscalDocumentService business isolation', () => {
  const businessA = 'business-a';
  const businessB = 'business-b';

  function setup() {
    const documentA: any = {
      id: 'invoice-a',
      businessId: businessA,
      orderId: 'order-a',
      type: 'INVOICE',
      status: 'VALIDATED',
      referenceCode: 'FE-invoice-a',
      fiscalFingerprint: 'fingerprint-a',
      payloadSnapshot: { items: [{ code_reference: 'A' }] },
      itemsSnapshot: [{ code_reference: 'A' }],
      paymentSnapshot: { amount: '119000.00' },
      reversalRequestedAt: null,
      factusNumber: 'SETP-A',
      order: { taxLines: [] },
      business: {
        factusConfiguration: {
          enabled: true,
          encryptedCredentials: 'encrypted',
          environment: 'sandbox',
        },
      },
    };
    const attempts: any[] = [];
    const children: any[] = [];
    const prisma: any = {
      fiscalDocument: {
        findFirst: jest.fn(({ where }: any) =>
          where.id === documentA.id && where.businessId === businessA
            ? documentA
            : null,
        ),
        findMany: jest.fn(({ where }: any) =>
          where.businessId === businessA ? [documentA] : [],
        ),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      fiscalDocumentAttempt: { create: jest.fn() },
      fiscalDocumentArtifact: { upsert: jest.fn() },
      factusConfiguration: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const provider: any = {
      validateInvoice: jest.fn(),
      validateCreditNote: jest.fn(),
      decryptCredentials: jest.fn(),
    };
    const storage: any = { uploadObject: jest.fn() };
    return {
      service: new FiscalDocumentService(prisma, provider, storage),
      prisma,
      provider,
      storage,
      documentA,
      attempts,
      children,
    };
  }

  it.each([
    ['dispatch', (service: FiscalDocumentService) => service.dispatch(businessB, 'invoice-a')],
    ['retry', (service: FiscalDocumentService) => service.retry(businessB, 'invoice-a')],
    [
      'credit-note',
      (service: FiscalDocumentService) =>
        service.requestCreditNote(businessB, 'invoice-a', '2'),
    ],
  ])('%s returns 404 without touching a document owned by another business', async (_operation, invoke) => {
    const { service, prisma, provider, storage, documentA, attempts, children } = setup();
    const before = structuredClone(documentA);

    await expect(invoke(service)).rejects.toThrow('Documento fiscal no encontrado');

    expect(documentA).toEqual(before);
    expect(attempts).toHaveLength(0);
    expect(children).toHaveLength(0);
    expect(prisma.fiscalDocument.updateMany).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.create).not.toHaveBeenCalled();
    expect(prisma.fiscalDocumentAttempt.create).not.toHaveBeenCalled();
    expect(prisma.factusConfiguration.findUnique).not.toHaveBeenCalled();
    expect(provider.validateInvoice).not.toHaveBeenCalled();
    expect(provider.validateCreditNote).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('lists only documents from the authenticated business', async () => {
    const { service } = setup();

    await expect(service.list(businessA)).resolves.toHaveLength(1);
    await expect(service.list(businessB)).resolves.toEqual([]);
  });
});

describe('FiscalDocumentService recovery', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');

  function candidate(overrides: Record<string, unknown> = {}) {
    return {
      id: 'document-recovery-1',
      businessId: 'business-1',
      type: 'INVOICE',
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 31_000),
      referenceCode: 'FE-recovery-1',
      fiscalFingerprint: 'fingerprint-recovery-1',
      payloadSnapshot: { customer: { identification: '22222222222' } },
      itemsSnapshot: [{ code_reference: 'ITEM-1' }],
      paymentSnapshot: { amount: '119000.00' },
      order: { taxLines: [] },
      attempts: [],
      _count: { attempts: 0 },
      ...overrides,
    };
  }

  function setup(documents: any[]) {
    const prisma: any = {
      fiscalDocument: { findMany: jest.fn().mockResolvedValue(documents) },
    };
    const service = new FiscalDocumentService(prisma, {} as any, {} as any);
    return { service, prisma };
  }

  it('recovers an old PENDING document without changing its historical snapshots', async () => {
    const document = candidate();
    const immutable = structuredClone({
      id: document.id,
      referenceCode: document.referenceCode,
      fiscalFingerprint: document.fiscalFingerprint,
      payloadSnapshot: document.payloadSnapshot,
      itemsSnapshot: document.itemsSnapshot,
      paymentSnapshot: document.paymentSnapshot,
    });
    const { service } = setup([document]);
    const dispatch = jest.spyOn(service, 'dispatch').mockImplementation(async () => {
      document.status = 'VALIDATED';
      return document as any;
    });

    await expect(service.recoverPendingDocuments(now)).resolves.toMatchObject({
      scanned: 1,
      eligible: 1,
    });
    expect(dispatch).toHaveBeenCalledWith('business-1', 'document-recovery-1');
    expect(document).toMatchObject({ ...immutable, status: 'VALIDATED' });
  });

  it('skips recent, terminal and SUBMITTED_PENDING_DIAN documents', async () => {
    const { service } = setup([
      candidate({ id: 'recent', createdAt: new Date(now.getTime() - 29_000) }),
      candidate({ id: 'validated', status: 'VALIDATED' }),
      candidate({ id: 'rejected', status: 'REJECTED' }),
      candidate({ id: 'credited', status: 'CREDITED' }),
      candidate({ id: 'submitted', status: 'SUBMITTED_PENDING_DIAN' }),
    ]);
    const dispatch = jest.spyOn(service, 'dispatch');

    await expect(service.recoverPendingDocuments(now)).resolves.toMatchObject({
      scanned: 5,
      eligible: 0,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('recovers an expired RETRYABLE_FAILURE and permits one new attempt', async () => {
    const document = candidate({
      status: 'RETRYABLE_FAILURE',
      attempts: [{ completedAt: new Date(now.getTime() - 31_000) }],
      _count: { attempts: 1 },
    });
    const { service } = setup([document]);
    const dispatch = jest.spyOn(service, 'dispatch').mockImplementation(async () => {
      document._count.attempts += 1;
      document.status = 'VALIDATED';
      return document as any;
    });

    await service.recoverPendingDocuments(now);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(document._count.attempts).toBe(2);
    expect(document.status).toBe('VALIDATED');
  });

  it('does not retry a document that reached the automatic attempt limit', async () => {
    const { service } = setup([
      candidate({
        status: 'RETRYABLE_FAILURE',
        attempts: [{ completedAt: new Date(now.getTime() - 60 * 60_000) }],
        _count: { attempts: 10 },
      }),
    ]);
    const dispatch = jest.spyOn(service, 'dispatch');

    await service.recoverPendingDocuments(now);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips legacy charge taxes without calling Factus through dispatch', async () => {
    const { service } = setup([
      candidate({
        order: {
          taxLines: [
            {
              applied: true,
              direction: 'CHARGE',
              taxType: 'IVA',
              orderItemId: null,
            },
          ],
        },
      }),
    ]);
    const dispatch = jest.spyOn(service, 'dispatch');

    await service.recoverPendingDocuments(now);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps snapshots unchanged when recovery dispatch has a temporary failure', async () => {
    const document = candidate({
      status: 'RETRYABLE_FAILURE',
      attempts: [{ completedAt: new Date(now.getTime() - 31_000) }],
      _count: { attempts: 1 },
    });
    const immutable = structuredClone({
      payloadSnapshot: document.payloadSnapshot,
      itemsSnapshot: document.itemsSnapshot,
      paymentSnapshot: document.paymentSnapshot,
    });
    const { service } = setup([document]);
    jest.spyOn(service, 'dispatch').mockImplementation(async () => {
      document.status = 'RETRYABLE_FAILURE';
      throw new Error('temporary failure');
    });

    await expect(service.recoverPendingDocuments(now)).resolves.toMatchObject({
      eligible: 1,
    });
    expect(document).toMatchObject({ ...immutable, status: 'RETRYABLE_FAILURE' });
  });

  it('allows only one effective provider execution when workers race for a document', async () => {
    const sharedDocument = candidate();
    const first = setup([sharedDocument]);
    const second = setup([sharedDocument]);
    let claimed = false;
    const provider = jest.fn(async () => undefined);
    const claimDispatch = async () => {
      if (claimed) return { status: 'PROCESSING' } as any;
      claimed = true;
      await provider();
      return { status: 'VALIDATED' } as any;
    };
    jest.spyOn(first.service, 'dispatch').mockImplementation(claimDispatch);
    jest.spyOn(second.service, 'dispatch').mockImplementation(claimDispatch);

    await Promise.all([
      first.service.recoverPendingDocuments(now),
      second.service.recoverPendingDocuments(now),
    ]);

    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping local cron cycles', async () => {
    let release!: () => void;
    const pending = new Promise<{ scanned: number; eligible: number }>((resolve) => {
      release = () => resolve({ scanned: 0, eligible: 0 });
    });
    const fiscalDocuments = {
      recoverPendingDocuments: jest.fn().mockReturnValue(pending),
    } as any;
    const recovery = new FiscalDocumentRecoveryService(fiscalDocuments);

    const first = recovery.recoverOnSchedule();
    await recovery.recoverOnSchedule();
    expect(fiscalDocuments.recoverPendingDocuments).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});

describe('FiscalDocumentService dispatch retry snapshots', () => {
  const originalPayload = {
    document: '01',
    numbering_range_id: 389,
    payment_details: [
      { amount: '1091000.00', payment_form: '1', payment_method_code: '10' },
    ],
    customer: { identification: '22222222222', names: 'Consumidor Final' },
    items: [
      { code_reference: 'HAMB', taxes: [{ code: '04', rate: '8.00' }] },
      { code_reference: 'LLAV', taxes: [{ code: '01', rate: '19.00' }] },
    ],
  };

  function setupRetryFlow(initialStatus = 'PENDING') {
    const document: any = {
      id: 'document-retry-1',
      businessId: 'business-1',
      type: 'INVOICE',
      status: initialStatus,
      referenceCode: 'FE-document-retry-1',
      fiscalFingerprint: 'immutable-fingerprint',
      payloadSnapshot: structuredClone(originalPayload),
      itemsSnapshot: structuredClone(originalPayload.items),
      paymentSnapshot: structuredClone(originalPayload.payment_details[0]),
      factusNumber: null,
      cufeOrCude: null,
      business: {
        factusConfiguration: {
          enabled: true,
          encryptedCredentials: 'encrypted',
          environment: 'sandbox',
        },
      },
    };
    const attempts: any[] = [];
    const prisma: any = {
      fiscalDocument: {
        findFirst: jest.fn(({ where }: any) => {
          if (where.type === 'INVOICE') return { order: { taxLines: [] } };
          return document;
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          if (
            where.id === document.id &&
            where.businessId === document.businessId &&
            where.status.in.includes(document.status)
          ) {
            document.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(() => document),
      },
      fiscalDocumentAttempt: {
        create: jest.fn(({ data }: any) => {
          const attempt = { id: `attempt-${attempts.length + 1}`, ...data };
          attempts.push(attempt);
          return attempt;
        }),
      },
      fiscalDocumentArtifact: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          fiscalDocumentAttempt: {
            updateMany: jest.fn(({ where, data }: any) => {
              Object.assign(attempts.find((attempt) => attempt.id === where.id), data);
            }),
          },
          fiscalDocument: {
            updateMany: jest.fn(({ data }: any) => {
              Object.assign(document, data);
              return { count: 1 };
            }),
            findFirst: jest.fn().mockImplementation(() => document),
          },
        }),
      ),
    };
    const provider: any = {
      decryptCredentials: jest.fn().mockReturnValue({}),
      validateInvoice: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Factus temporal failure'), {
            status: 500,
            body: { message: 'temporary provider failure' },
          }),
        )
        .mockResolvedValueOnce({
          data: {
            is_validated: true,
            number: 'SETP990019999',
            cufe: 'CUFE-RETRY-1',
            validated_at: '13-09-2026 10:37:14 PM',
          },
        }),
      download: jest.fn().mockResolvedValue({
        base64: Buffer.from('artifact').toString('base64'),
        contentType: 'application/octet-stream',
        extension: 'pdf',
      }),
    };
    const storage: any = { uploadObject: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new FiscalDocumentService(prisma, provider, storage),
      prisma,
      provider,
      document,
      attempts,
    };
  }

  it('reuses one immutable document and its original payload after a retryable provider failure', async () => {
    const { service, provider, document, attempts } = setupRetryFlow();
    const immutable = {
      id: document.id,
      referenceCode: document.referenceCode,
      fiscalFingerprint: document.fiscalFingerprint,
      payloadSnapshot: structuredClone(document.payloadSnapshot),
      itemsSnapshot: structuredClone(document.itemsSnapshot),
      paymentSnapshot: structuredClone(document.paymentSnapshot),
    };

    await expect(service.dispatch('business-1', document.id)).rejects.toThrow(
      'Factus temporal failure',
    );

    expect(document).toMatchObject({
      status: 'RETRYABLE_FAILURE',
      factusNumber: null,
      cufeOrCude: null,
      ...immutable,
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      result: 'RETRYABLE_FAILURE',
      httpStatus: 500,
    });

    await expect(service.retry('business-1', document.id)).resolves.toMatchObject({
      status: 'VALIDATED',
      factusNumber: 'SETP990019999',
      cufeOrCude: 'CUFE-RETRY-1',
    });

    expect(document).toMatchObject({ ...immutable, status: 'VALIDATED' });
    expect(document.dianValidatedAt?.toISOString()).toBe('2026-09-14T03:37:14.000Z');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].result).toBe('RETRYABLE_FAILURE');
    expect(attempts[1]).toMatchObject({ result: 'SUCCEEDED', httpStatus: 201 });
    expect(provider.validateInvoice).toHaveBeenCalledTimes(2);
    expect(provider.validateInvoice.mock.calls[1][3]).toEqual({
      ...originalPayload,
      reference_code: immutable.referenceCode,
    });
  });

  it.each(['REJECTED', 'VALIDATED', 'LOCAL_PERSISTENCE_FAILURE', 'PROCESSING'])('blocks retry from %s', async (status) => {
    const { service, provider, prisma, document } = setupRetryFlow(status);

    await expect(service.retry('business-1', document.id)).rejects.toThrow(
      'El documento no puede reintentarse en su estado actual',
    );
    expect(provider.validateInvoice).not.toHaveBeenCalled();
    expect(prisma.fiscalDocument.updateMany).not.toHaveBeenCalled();
  });

  it('protects an accepted Factus response when the normal local persistence fails', async () => {
    const { service, prisma, provider, document, attempts } = setupRetryFlow();
    provider.validateInvoice.mockReset().mockResolvedValue({
      data: {
        is_validated: true,
        number: 'SETP990018954',
        cufe: 'CUFE-ACCEPTED',
        validated_at: '13-09-2026 10:37:14 PM',
      },
    });
    let transaction = 0;
    prisma.$transaction.mockImplementation(async (callback: any) => {
      transaction += 1;
      if (transaction === 1) {
        return callback({
          fiscalDocumentAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          fiscalDocument: {
            updateMany: jest.fn().mockRejectedValue(new Error('Prisma write failed')),
            findFirst: jest.fn(),
          },
        });
      }
      return callback({
        fiscalDocumentAttempt: {
          updateMany: jest.fn(({ where, data }: any) => {
            Object.assign(attempts.find((attempt) => attempt.id === where.id), data);
            return { count: 1 };
          }),
        },
        fiscalDocument: {
          updateMany: jest.fn(({ data }: any) => {
            Object.assign(document, data);
            return { count: 1 };
          }),
          findFirst: jest.fn().mockResolvedValue(document),
        },
      });
    });

    await expect(service.dispatch('business-1', document.id)).resolves.toMatchObject({
      status: 'LOCAL_PERSISTENCE_FAILURE',
      factusNumber: 'SETP990018954',
      cufeOrCude: 'CUFE-ACCEPTED',
    });

    expect(document.dianValidatedAt?.toISOString()).toBe('2026-09-14T03:37:14.000Z');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      result: 'LOCAL_PERSISTENCE_FAILURE',
      httpStatus: 201,
      responsePayload: expect.objectContaining({ data: expect.objectContaining({ is_validated: true }) }),
    });
    expect(provider.validateInvoice).toHaveBeenCalledTimes(1);
    await expect(service.retry('business-1', document.id)).rejects.toThrow(
      'El documento no puede reintentarse en su estado actual',
    );
    expect(provider.validateInvoice).toHaveBeenCalledTimes(1);
  });

  it('reconciles a verified accepted response without a second Factus validate call', async () => {
    const { service, prisma, provider, document, attempts } = setupRetryFlow('LOCAL_PERSISTENCE_FAILURE');
    document.payloadSnapshot = { reference_code: document.referenceCode, items: [] };
    provider.download = jest.fn().mockResolvedValue({
      base64: Buffer.from('artifact').toString('base64'),
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    prisma.factusConfiguration = {
      findUnique: jest.fn().mockResolvedValue(document.business.factusConfiguration),
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      fiscalDocumentAttempt: {
        create: jest.fn(({ data }: any) => {
          attempts.push({ id: `attempt-${attempts.length + 1}`, ...data });
          return attempts[attempts.length - 1];
        }),
      },
      fiscalDocument: {
        updateMany: jest.fn(({ data }: any) => {
          Object.assign(document, data);
          return { count: 1 };
        }),
        findFirst: jest.fn().mockResolvedValue(document),
      },
    }));

    await expect(service.reconcileAcceptedProviderResponse('business-1', document.id, {
      data: {
        is_validated: true,
        reference_code: document.referenceCode,
        number: 'SETP990018954',
        cufe: 'CUFE-ACCEPTED',
        validated_at: '13-09-2026 10:37:14 PM',
      },
    })).resolves.toMatchObject({ status: 'VALIDATED', factusNumber: 'SETP990018954' });

    expect(document.dianValidatedAt?.toISOString()).toBe('2026-09-14T03:37:14.000Z');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ result: 'SUCCEEDED', httpStatus: 201 });
    expect(provider.validateInvoice).not.toHaveBeenCalled();
  });

  it('persists a Factus-format validated_at for a credit note', async () => {
    const { service, provider, document } = setupRetryFlow();
    document.type = 'CREDIT_NOTE';
    provider.validateCreditNote = jest.fn().mockResolvedValue({
      data: {
        is_validated: true,
        number: 'NC9901',
        cude: 'CUDE-CREDIT-1',
        validated_at: '01-01-2026 12:00:00 AM',
      },
    });

    await expect(service.dispatch('business-1', document.id)).resolves.toMatchObject({
      status: 'VALIDATED',
      cufeOrCude: 'CUDE-CREDIT-1',
    });
    expect(document.dianValidatedAt?.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(provider.validateCreditNote).toHaveBeenCalledTimes(1);
  });

  it('keeps a validated invoice valid when Factus sends an invalid auxiliary date', async () => {
    const { service, provider, document } = setupRetryFlow();
    provider.validateInvoice.mockReset().mockResolvedValue({
      data: {
        is_validated: true,
        number: 'SETP990018955',
        cufe: 'CUFE-INVALID-DATE',
        validated_at: '31-02-2026 10:37:14 PM',
      },
    });

    await expect(service.dispatch('business-1', document.id)).resolves.toMatchObject({
      status: 'VALIDATED',
      factusNumber: 'SETP990018955',
    });
    expect(document.dianValidatedAt).toBeNull();
    expect(Number.isNaN(document.dianValidatedAt?.getTime())).toBe(false);
  });
});

describe('FiscalDocumentService credit-note payment details', () => {
  const paymentSnapshot = {
    amount: '119000.00',
    payment_form: '1',
    payment_method_code: '10',
  };

  const invoice = {
    id: 'invoice-1',
    businessId: 'business-1',
    orderId: 'order-1',
    type: 'INVOICE',
    status: 'VALIDATED',
    factusNumber: 'SETP990018405',
    paymentSnapshot,
    sellerSnapshot: { nit: '1' },
    buyerSnapshot: { identification: '22222222222' },
    itemsSnapshot: [{ name: 'Llaveros', code_reference: 'item-llaveros' }],
    taxSnapshot: { tax: 'snapshot' },
    total: '119000.00',
  };

  function setup(invoiceOverride: Record<string, unknown> = {}) {
    const prisma: any = {
      fiscalDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ ...invoice, ...invoiceOverride })
          .mockResolvedValueOnce(null),
      },
      factusConfiguration: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ enabled: true, creditNoteRangeId: 1776 }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          fiscalDocument: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockImplementation(({ data }: any) => data),
          },
        }),
      ),
    };
    const provider: any = {};
    const storage: any = {};
    const service = new FiscalDocumentService(prisma, provider, storage);
    jest.spyOn(service, 'dispatch').mockResolvedValue({} as any);
    return { service, prisma };
  }

  it.each(['LOCAL_PERSISTENCE_FAILURE', 'PROCESSING'])(
    'blocks credit-note creation while the invoice is protected in %s',
    async (status) => {
      const { service, prisma } = setup({ status });

      await expect(
        service.requestCreditNote('business-1', 'invoice-1', '2'),
      ).rejects.toThrow('La factura requiere sincronizacion local antes de crear una nota credito');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('copies the frozen payment snapshot into one credit-note payment detail', async () => {
    const { service, prisma } = setup();

    const credit = await service.requestCreditNote(
      'business-1',
      'invoice-1',
      '2',
    );
    const create = prisma.$transaction.mock.calls[0][0];
    const tx: any = {
      fiscalDocument: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    await create(tx);

    expect(credit.paymentSnapshot).toEqual(paymentSnapshot);
    expect(credit.itemsSnapshot).toEqual(invoice.itemsSnapshot);
    expect(tx.fiscalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentDocumentId: 'invoice-1',
          paymentSnapshot,
          payloadSnapshot: expect.objectContaining({
            bill_number: 'SETP990018405',
            numbering_range_id: 1776,
            correction_concept_code: '2',
            payment_details: [paymentSnapshot],
            customer: invoice.buyerSnapshot,
            items: invoice.itemsSnapshot,
          }),
        }),
      }),
    );
    expect(tx.fiscalDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-1', businessId: 'business-1' },
        data: expect.objectContaining({
          reversalRequestedAt: expect.any(Date),
        }),
      }),
    );
  });

  it.each([
    [
      'absent',
      null,
      'La factura validada no tiene un snapshot de pago válido para crear la nota crédito',
    ],
    [
      'incomplete',
      { amount: '119000.00' },
      'La factura validada tiene un snapshot de pago incompleto para crear la nota crédito',
    ],
  ])(
    'rejects a %s payment snapshot locally without dispatching',
    async (_name, invalidSnapshot, message) => {
      const { service, prisma } = setup({ paymentSnapshot: invalidSnapshot });

      await expect(
        service.requestCreditNote('business-1', 'invoice-1', '2'),
      ).rejects.toThrow(message);

      expect(service.dispatch).not.toHaveBeenCalled();
      expect(prisma.factusConfiguration.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
