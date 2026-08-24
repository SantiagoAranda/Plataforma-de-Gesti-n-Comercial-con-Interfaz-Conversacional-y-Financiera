import { Prisma } from '@prisma/client';
import { deriveIncomeTaxDeclarant, SettingsService } from './settings.service';

describe('SettingsService ICA rates', () => {
  const municipalityIcaRate = {
    findUnique: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const taxResponsibility = {
    findMany: jest.fn(),
  };
  const prisma = { municipalityIcaRate, taxResponsibility };
  const service = new SettingsService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts per-thousand inputs to decimal rates exactly once on create', async () => {
    municipalityIcaRate.findUnique.mockResolvedValue(null);
    municipalityIcaRate.create.mockImplementation(({ data }) => data);

    await service.createIcaRate('business-1', {
      municipalityCode: '11001',
      ciiuCode: '4711',
      activityName: null as any,
      icaRatePerThousand: 9.66,
      reteIcaRatePerThousand: 9.66,
      minBaseUvt: 0,
    });

    const data = municipalityIcaRate.create.mock.calls[0][0].data;
    expect(new Prisma.Decimal(data.icaRate).toFixed(6)).toBe('0.009660');
    expect(new Prisma.Decimal(data.reteIcaRate).toFixed(6)).toBe('0.009660');
  });

  it('converts per-thousand inputs to decimal rates exactly once on update', async () => {
    municipalityIcaRate.findFirst.mockResolvedValue({ id: 'rate-1' });
    municipalityIcaRate.update.mockImplementation(({ data }) => data);

    await service.updateIcaRate('business-1', 'rate-1', {
      icaRatePerThousand: 9.66,
      reteIcaRatePerThousand: 9.66,
    });

    const data = municipalityIcaRate.update.mock.calls[0][0].data;
    expect(new Prisma.Decimal(data.icaRate).toFixed(6)).toBe('0.009660');
    expect(new Prisma.Decimal(data.reteIcaRate).toFixed(6)).toBe('0.009660');
  });

  it('exposes Gran Contribuyente and Autorretenedor in the RUT catalog', async () => {
    taxResponsibility.findMany.mockResolvedValue([]);

    await service.listTaxResponsibilities();

    expect(taxResponsibility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: {
            in: expect.arrayContaining(['13', '15']),
          },
        },
      }),
    );
  });
});

describe('SettingsService tax profile normalization', () => {
  const baseDto = (responsibilityCodes: string[], isIncomeTaxDeclarant?: boolean) => ({
    personType: 'NATURAL',
    documentType: 'NIT',
    nit: '900123456',
    dv: '1',
    tradeName: 'Test Business',
    email: 'test@example.com',
    phone: '3001234567',
    departmentCode: '11',
    municipalityCode: '11001',
    address: 'Calle 1',
    mainCiiuCode: '4711',
    mainCiiuDescription: 'Comercio',
    isIncomeTaxDeclarant,
    responsibilityCodes,
  });

  const makeService = (
    existingProfile: any = null,
    featureFlags: any = {
      simpleRegimeSalesEnabled: true,
      simpleRegimeTaxModuleEnabled: false,
      simpleRegimeEnabled: true,
    },
  ) => {
    const tx = {
      businessTaxProfile: {
        findUnique: jest.fn().mockResolvedValue(existingProfile),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'profile-1', ...data }),
        ),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'profile-1', ...existingProfile, ...data }),
        ),
      },
      businessTaxResponsibility: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      taxResponsibility: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.code.in.map((code: string) => ({
              id: `tax-responsibility-${code}`,
              code,
            })),
          ),
        ),
      },
      business: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    tx.businessTaxProfile.findUnique
      .mockResolvedValueOnce(existingProfile)
      .mockResolvedValueOnce({
        id: 'profile-1',
        businessId: 'business-1',
        responsibilities: [],
      });

    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    return {
      service: new SettingsService(prisma as any, featureFlags),
      tx,
    };
  };

  it('allows adding and removing responsibility 47 when sales are enabled and the tax module is disabled', async () => {
    const { service, tx } = makeService(null, {
      simpleRegimeSalesEnabled: true,
      simpleRegimeTaxModuleEnabled: false,
      simpleRegimeEnabled: true,
    });

    await service.upsertTaxProfile('business-1', baseDto(['47']) as any);

    expect(tx.businessTaxResponsibility.createMany).toHaveBeenCalledWith({
      data: [{ taxProfileId: 'profile-1', taxResponsibilityId: 'tax-responsibility-47' }],
    });

    await service.upsertTaxProfile('business-1', baseDto([]) as any);

    expect(tx.businessTaxResponsibility.deleteMany).toHaveBeenCalledWith({
      where: { taxProfileId: 'profile-1' },
    });
    expect(tx.businessTaxResponsibility.createMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    [['49'], false],
    [['49', '05'], true],
    [['05', '48'], true],
  ])('derives isIncomeTaxDeclarant for natural responsibilities %j', async (codes, expected) => {
    const { service, tx } = makeService();
    const dto = baseDto(codes) as any;
    delete dto.isIncomeTaxDeclarant;

    await service.upsertTaxProfile('business-1', dto);

    expect(tx.businessTaxProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isIncomeTaxDeclarant: expected,
        }),
      }),
    );
  });

  it('rejects profiles with both IVA responsible and non-responsible codes', async () => {
    const { service } = makeService();

    await expect(
      service.upsertTaxProfile('business-1', baseDto(['48', '49']) as any),
    ).rejects.toThrow('Responsable de IVA');
  });

  it('rejects RUT profiles with both Gran Contribuyente (13) and Autorretenedor (15) codes', async () => {
    const { service } = makeService();

    await expect(
      service.upsertTaxProfile('business-1', baseDto(['13', '15']) as any),
    ).rejects.toThrow('Gran Contribuyente');
  });

  it('preserves advanced-mode declarant value when responsibilities have no clear rule', async () => {
    const { service, tx } = makeService({ id: 'profile-1', isIncomeTaxDeclarant: true });

    await service.upsertTaxProfile('business-1', baseDto(['07'], false) as any);

    expect(tx.businessTaxProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isIncomeTaxDeclarant: false,
        }),
      }),
    );
  });

  it('preserves false when another RUT field is updated without a declarant value', async () => {
    const { service, tx } = makeService({ id: 'profile-1', isIncomeTaxDeclarant: false });
    const dto = baseDto(['05', '48']) as any;
    delete dto.isIncomeTaxDeclarant;

    await service.upsertTaxProfile('business-1', dto);

    expect(tx.businessTaxProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isIncomeTaxDeclarant: false }),
      }),
    );
  });

  it('normalizes the historical true default for Natural + 49 without 05 before resolving persisted value', async () => {
    const { service, tx } = makeService({ id: 'profile-1', isIncomeTaxDeclarant: true });
    const dto = baseDto(['49']) as any;
    delete dto.isIncomeTaxDeclarant;

    await service.upsertTaxProfile('business-1', dto);

    expect(tx.businessTaxProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isIncomeTaxDeclarant: false }),
      }),
    );
  });

  it('keeps the derived result when an unrelated responsibility changes', () => {
    expect(deriveIncomeTaxDeclarant('NATURAL' as any, ['49'])).toBe(false);
    expect(deriveIncomeTaxDeclarant('NATURAL' as any, ['49', '07'])).toBe(false);
    expect(deriveIncomeTaxDeclarant('NATURAL' as any, ['49', '05'])).toBe(true);
  });

  it('updates declarant from false to true', async () => {
    const { service, tx } = makeService({ id: 'profile-1', isIncomeTaxDeclarant: false });

    await service.upsertTaxProfile('business-1', baseDto(['49'], true) as any);

    expect(tx.businessTaxProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isIncomeTaxDeclarant: true }),
      }),
    );
  });
});
