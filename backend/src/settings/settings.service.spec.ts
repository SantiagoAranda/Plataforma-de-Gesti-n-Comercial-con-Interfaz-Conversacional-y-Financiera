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
