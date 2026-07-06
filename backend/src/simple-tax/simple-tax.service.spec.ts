import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, SimpleTaxPeriodType } from '@prisma/client';
import { SimpleTaxService } from './simple-tax.service';

const mockFn = () => jest.fn<(...args: any[]) => any>();

describe('SimpleTaxService', () => {
  const businessId = 'business-1';
  let service: SimpleTaxService;

  const prisma = {
    businessSimpleTaxConfig: {
      findUnique: mockFn(),
      upsert: mockFn(),
    },
    taxGlobalParameter: {
      findUnique: mockFn(),
    },
    order: {
      findMany: mockFn(),
    },
    simpleTaxRateBracket: {
      findMany: mockFn(),
    },
    businessTaxProfile: {
      findUnique: mockFn(),
    },
    simpleTaxPeriod: {
      findMany: mockFn(),
      findFirst: mockFn(),
      findUnique: mockFn(),
      upsert: mockFn(),
      update: mockFn(),
    },
  };

  const groups = {
    '1': {
      name: 'Grupo 1',
      rows: [
        [0, 1000, 0.012],
        [1000, 2500, 0.028],
        [2500, 5000, 0.044],
        [5000, 16666.67, 0.056],
      ],
    },
    '2': {
      name: 'Grupo 2',
      rows: [
        [0, 1000, 0.016],
        [1000, 2500, 0.02],
        [2500, 5000, 0.035],
        [5000, 16666.67, 0.045],
      ],
    },
    '3': {
      name: 'Grupo 3',
      rows: [
        [0, 1000, 0.059],
        [1000, 2500, 0.073],
        [2500, 5000, 0.12],
        [5000, 16666.67, 0.145],
      ],
    },
  } as const;

  function mockConfig(groupCode = '2') {
    prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      businessId,
      enabled: true,
      taxYear: 2026,
      groupCode,
      activityLabel: null,
      ciiuCode: null,
    });
  }

  function mockRates(groupCode = '2') {
    const group = groups[groupCode as keyof typeof groups];
    prisma.simpleTaxRateBracket.findMany.mockResolvedValue(
      group.rows.map(([lowerUvt, upperUvt, rate]) => ({
        taxYear: 2026,
        periodType: SimpleTaxPeriodType.BIMONTHLY,
        groupCode,
        groupName: group.name,
        lowerUvt: new Prisma.Decimal(lowerUvt),
        upperUvt: new Prisma.Decimal(upperUvt),
        rate: new Prisma.Decimal(rate),
        active: true,
      })),
    );
  }

  function mockSales(amount: number) {
    prisma.order.findMany.mockResolvedValue([
      {
        total: new Prisma.Decimal(amount),
        fiscalContext: { subtotal: new Prisma.Decimal(amount) },
      },
    ]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SimpleTaxService(prisma as any);
    prisma.taxGlobalParameter.findUnique.mockResolvedValue({
      year: 2026,
      uvt: new Prisma.Decimal(52374),
    });
    prisma.businessTaxProfile.findUnique.mockResolvedValue({
      responsibilities: [{ responsibility: { code: '47' } }],
    });
    mockConfig('2');
    mockRates('2');
    mockSales(0);
  });

  it('calculates group 2 first bimonthly range for 50,000,000', async () => {
    mockSales(50000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.taxableGrossIncomeUvt).toBe(954.67);
    expect(result.response.bracket.lowerUvt).toBe(0);
    expect(result.response.bracket.upperUvt).toBe(1000);
    expect(result.response.appliedRate).toBe(0.016);
    expect(result.response.grossSimpleTax).toBe(800000);
    expect(result.response.totalDiscounts).toBe(0);
    expect(result.response.netSimpleTax).toBe(800000);
  });

  it('calculates group 2 second range for 120,000,000 independently', async () => {
    mockSales(120000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 2,
    });

    expect(result.response.taxableGrossIncomeUvt).toBe(2291.21);
    expect(result.response.bracket.lowerUvt).toBe(1000);
    expect(result.response.bracket.upperUvt).toBe(2500);
    expect(result.response.appliedRate).toBe(0.02);
    expect(result.response.grossSimpleTax).toBe(2400000);
  });

  it('calculates group 1 at 1.2% for 50,000,000', async () => {
    mockConfig('1');
    mockRates('1');
    mockSales(50000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.appliedRate).toBe(0.012);
    expect(result.response.grossSimpleTax).toBe(600000);
  });

  it('calculates group 3 at 5.9% for 50,000,000', async () => {
    mockConfig('3');
    mockRates('3');
    mockSales(50000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.appliedRate).toBe(0.059);
    expect(result.response.grossSimpleTax).toBe(2950000);
  });

  it('applies electronic payments discount at 0.5%', async () => {
    mockSales(50000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
      electronicPaymentsIncome: 20000000,
    });

    expect(result.response.grossSimpleTax).toBe(800000);
    expect(result.response.electronicPaymentsDiscount).toBe(100000);
    expect(result.response.netSimpleTax).toBe(700000);
  });

  it('allows zero income', async () => {
    mockSales(0);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.grossSimpleTax).toBe(0);
    expect(result.response.netSimpleTax).toBe(0);
  });

  it('does not accumulate previous bimonthly periods', async () => {
    mockSales(50000000);
    const first = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    mockSales(120000000);
    const second = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 2,
    });

    expect(first.response.grossSimpleTax).toBe(800000);
    expect(second.response.grossSimpleTax).toBe(2400000);
  });

  it('uses fiscal subtotal instead of order total, net received, IVA or costs', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        total: new Prisma.Decimal(1190000),
        fiscalContext: { subtotal: new Prisma.Decimal(1000000) },
      },
    ]);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.salesGrossIncome).toBe(1000000);
    expect(result.response.grossSimpleTax).toBe(16000);
  });

  it('rejects electronic payments above taxable income', async () => {
    mockSales(1000000);

    await expect(
      service.calculate(businessId, {
        taxYear: 2026,
        periodNumber: 1,
        electronicPaymentsIncome: 1000001,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters only completed sales inside the selected bimonthly period', async () => {
    await service.calculate(businessId, { taxYear: 2026, periodNumber: 1 });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          status: 'COMPLETED',
          archived: false,
        }),
      }),
    );
  });
});
