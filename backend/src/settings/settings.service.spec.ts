import { Prisma } from '@prisma/client';
import { SettingsService } from './settings.service';

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

  const makeService = (existingProfile: any = null) => {
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
      service: new SettingsService(prisma as any),
      tx,
    };
  };

  it.each([
    [['49'], false],
    [['05', '48'], true],
    [['05', '48', '07'], true],
    [['47'], true],
    [['13', '05', '48', '07'], true],
    [['15', '05', '48'], true],
  ])('derives isIncomeTaxDeclarant for responsibilities %j', async (codes, expected) => {
    const { service, tx } = makeService();

    await service.upsertTaxProfile('business-1', baseDto(codes, !expected) as any);

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

  it('allows RUT profiles with both Gran Contribuyente (13) and Autorretenedor (15) codes', async () => {
    const { service, tx } = makeService();

    await service.upsertTaxProfile('business-1', baseDto(['13', '15']) as any);

    expect(tx.businessTaxResponsibility.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ taxResponsibilityId: 'tax-responsibility-13' }),
        expect.objectContaining({ taxResponsibilityId: 'tax-responsibility-15' }),
      ]),
    });
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
});
