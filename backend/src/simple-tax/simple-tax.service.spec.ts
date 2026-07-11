import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Prisma,
  SimpleTaxFilingMode,
  SimpleTaxPeriodStatus,
  SimpleTaxPeriodType,
  SimpleTaxAnnualReturnStatus,
} from '@prisma/client';
import { SimpleTaxService } from './simple-tax.service';

const mockFn = () => jest.fn<(...args: any[]) => any>();

describe('SimpleTaxService', () => {
  const businessId = 'business-1';
  let service: SimpleTaxService;

  const prisma = {
    $transaction: mockFn(),
    $queryRaw: mockFn(),
    businessSimpleTaxConfig: {
      findUnique: mockFn(),
      upsert: mockFn(),
    },
    taxGlobalParameter: {
      findUnique: mockFn(),
    },
    economicActivityCiiu: {
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
    simpleTaxAnnualReturn: {
      findMany: mockFn(),
      findFirst: mockFn(),
      findUnique: mockFn(),
      upsert: mockFn(),
      update: mockFn(),
    },
    simpleTaxPeriod: {
      findMany: mockFn(),
      findFirst: mockFn(),
      findUnique: mockFn(),
      upsert: mockFn(),
      update: mockFn(),
    },
    accountingMovement: {
      count: mockFn(),
      createMany: mockFn(),
    },
    pucSubcuenta: {
      findMany: mockFn(),
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
      filingMode: SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
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

  function mockActivityGroupMapping(groupCode = '2') {
    const group = groups[groupCode as keyof typeof groups];
    prisma.$queryRaw.mockResolvedValue([
      {
        id: `mapping-${groupCode}`,
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode,
        groupName: group.name,
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
  }

  function mockSales(amount: number) {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        documentNumber: 'FV-1',
        customerName: 'Cliente Demo',
        status: 'COMPLETED',
        accountingPostedAt: new Date('2026-01-20T10:00:00.000Z'),
        createdAt: new Date('2026-01-10T10:00:00.000Z'),
        total: new Prisma.Decimal(amount),
        fiscalContext: { subtotal: new Prisma.Decimal(amount) },
      },
    ]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SimpleTaxService(prisma as any);
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    prisma.accountingMovement.count.mockResolvedValue(0);
    prisma.accountingMovement.createMany.mockResolvedValue({ count: 2 });
    prisma.pucSubcuenta.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.code.in.map((code: string) => ({
          code,
        })),
      ),
    );
    prisma.taxGlobalParameter.findUnique.mockResolvedValue({
      year: 2026,
      uvt: new Prisma.Decimal(52374),
    });
    prisma.economicActivityCiiu.findUnique.mockResolvedValue({
      description: 'Comercio al por menor en establecimientos no especializados',
    });
    prisma.businessTaxProfile.findUnique.mockResolvedValue({
      mainCiiuCode: '4711',
      mainCiiuDescription: 'Comercio al por menor',
      responsibilities: [{ responsibility: { code: '47' } }],
      taxSettingsEnabled: true,
    });
    mockConfig('2');
    mockActivityGroupMapping('2');
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
    mockActivityGroupMapping('1');
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
    mockActivityGroupMapping('3');
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
        id: 'order-1',
        documentNumber: 'FV-1',
        customerName: 'Cliente Demo',
        status: 'COMPLETED',
        accountingPostedAt: new Date('2026-01-20T10:00:00.000Z'),
        createdAt: new Date('2026-01-10T10:00:00.000Z'),
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
    expect(result.response.includedSales).toEqual([
      expect.objectContaining({
        id: 'order-1',
        fiscalDate: '2026-01-20',
        subtotal: 1000000,
        status: 'COMPLETED',
      }),
    ]);
  });

  it('detects RST group from the RUT CIIU mapping', async () => {
    mockActivityGroupMapping('1');
    mockRates('1');
    mockSales(1000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.groupCode).toBe('1');
    expect(result.response.groupResolution).toEqual(
      expect.objectContaining({
        status: 'RESOLVED',
        ciiuCode: '4711',
        groupCode: '1',
        source: 'NOMINA_SIMULADOR_VENTAS',
      }),
    );
  });

  it('does not require manual groupCode in the backend config when mapping exists', async () => {
    mockConfig(null as any);
    mockActivityGroupMapping('2');
    mockRates('2');

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.groupCode).toBe('2');
  });

  it('uses the CIIU catalog description instead of the RST mapping description', async () => {
    prisma.businessTaxProfile.findUnique.mockResolvedValue({
      mainCiiuCode: '4711',
      mainCiiuDescription: null,
      responsibilities: [{ responsibility: { code: '47' } }],
      taxSettingsEnabled: true,
    });
    prisma.economicActivityCiiu.findUnique.mockResolvedValue({
      description: 'Descripcion oficial del catalogo CIIU',
    });
    mockActivityGroupMapping('2');
    mockRates('2');

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.groupResolution).toEqual(
      expect.objectContaining({
        ciiuCode: '4711',
        ciiuDescription: 'Descripcion oficial del catalogo CIIU',
        groupCode: '2',
      }),
    );
  });

  it('blocks bimonthly calculation when the RUT CIIU has no mapping', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      service.calculate(businessId, {
        taxYear: 2026,
        periodNumber: 1,
      }),
    ).rejects.toThrow('No se pudo determinar el grupo RST');
  });

  it('blocks bimonthly calculation when the RUT CIIU mapping is ambiguous', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'mapping-1',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '1',
        groupName: 'Grupo 1',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'mapping-2',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '2',
        groupName: 'Grupo 2',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.calculate(businessId, {
        taxYear: 2026,
        periodNumber: 1,
      }),
    ).rejects.toThrow('mas de un grupo RST posible');
  });

  it('returns AMBIGUOUS in config when the RUT CIIU has multiple mappings', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'mapping-1',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '1',
        groupName: 'Grupo 1',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'mapping-2',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '2',
        groupName: 'Grupo 2',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.getConfig(businessId);

    expect(result.groupResolution).toEqual(
      expect.objectContaining({
        status: 'AMBIGUOUS',
        ciiuCode: '4711',
        candidates: [
          { groupCode: '1', groupName: 'Grupo 1' },
          { groupCode: '2', groupName: 'Grupo 2' },
        ],
      }),
    );
  });

  it('blocks posting an old calculated period when the current CIIU has no resolved group', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.CALCULATED,
      taxYear: 2026,
      periodNumber: 1,
      periodEnd: new Date('2026-02-28T23:59:59.999Z'),
      netSimpleTax: new Prisma.Decimal(800000),
    });

    await expect(service.postPeriod(businessId, 'period-1')).rejects.toThrow(
      'grupo RST no esta resuelto',
    );
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('blocks paying a posted period when the current CIIU is ambiguous', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'mapping-1',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '1',
        groupName: 'Grupo 1',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'mapping-2',
        taxYear: 2026,
        ciiuCode: '4711',
        groupCode: '2',
        groupName: 'Grupo 2',
        source: 'NOMINA_SIMULADOR_VENTAS',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.POSTED,
      taxYear: 2026,
      periodNumber: 1,
      netSimpleTax: new Prisma.Decimal(800000),
    });

    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 800000,
      }),
    ).rejects.toThrow('grupo RST no esta resuelto');
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
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
          OR: [
            {
              accountingPostedAt: {
                gte: new Date('2026-01-01T00:00:00.000Z'),
                lt: new Date('2026-03-01T00:00:00.000Z'),
              },
            },
            {
              accountingPostedAt: null,
              createdAt: {
                gte: new Date('2026-01-01T00:00:00.000Z'),
                lt: new Date('2026-03-01T00:00:00.000Z'),
              },
            },
          ],
        }),
      }),
    );
  });

  it('uses accountingPostedAt as fiscal date when available', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-2',
        documentNumber: 'FV-2',
        customerName: 'Cliente Fiscal',
        status: 'COMPLETED',
        accountingPostedAt: new Date('2026-02-28T23:00:00.000Z'),
        createdAt: new Date('2026-01-05T10:00:00.000Z'),
        total: new Prisma.Decimal(1190000),
        fiscalContext: { subtotal: new Prisma.Decimal(1000000) },
      },
    ]);

    const result = await service.calculate(businessId, { taxYear: 2026, periodNumber: 1 });

    expect(result.response.includedSales[0]).toEqual(
      expect.objectContaining({
        id: 'order-2',
        fiscalDate: '2026-02-28',
        subtotal: 1000000,
      }),
    );
  });

  it('falls back to createdAt as fiscal date when accountingPostedAt is missing', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-3',
        documentNumber: null,
        customerName: null,
        status: 'COMPLETED',
        accountingPostedAt: null,
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
        total: new Prisma.Decimal(500000),
        fiscalContext: { subtotal: new Prisma.Decimal(500000) },
      },
    ]);

    const result = await service.calculate(businessId, { taxYear: 2026, periodNumber: 1 });

    expect(result.response.includedSales[0].fiscalDate).toBe('2026-01-15');
  });

  it('persists a complete calculation snapshot with bracket, UVT and included sales', async () => {
    mockSales(1000000);
    prisma.simpleTaxPeriod.findUnique.mockResolvedValue(null);
    prisma.simpleTaxPeriod.upsert.mockImplementation(async (args: any) => ({
      id: 'period-1',
      status: args.create.status,
      ...args.create,
    }));

    const result = await service.calculateAndPersist(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.id).toBe('period-1');
    expect(prisma.simpleTaxPeriod.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prisma.simpleTaxPeriod.upsert.mock.calls[0][0] as any;
    expect(upsertArg.create.calculationSnapshot).toEqual(
      expect.objectContaining({
        taxYear: 2026,
        periodNumber: 1,
        uvtValue: 52374,
        bracket: expect.objectContaining({ lowerUvt: 0, upperUvt: 1000, rate: 0.016 }),
        includedSales: [
          expect.objectContaining({
            id: 'order-1',
            fiscalDate: '2026-01-20',
            subtotal: 1000000,
            status: 'COMPLETED',
          }),
        ],
        calculatedAt: expect.any(String),
      }),
    );
  });

  it('recalculates the same period through upsert without creating duplicates', async () => {
    mockSales(1000000);
    prisma.simpleTaxPeriod.findUnique.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.CALCULATED,
    });
    prisma.simpleTaxPeriod.upsert.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.CALCULATED,
    });

    await service.calculateAndPersist(businessId, { taxYear: 2026, periodNumber: 1 });

    expect(prisma.simpleTaxPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_taxYear_periodNumber: {
            businessId,
            taxYear: 2026,
            periodNumber: 1,
          },
        },
      }),
    );
    expect(prisma.simpleTaxPeriod.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not recalculate posted periods', async () => {
    prisma.simpleTaxPeriod.findUnique.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.POSTED,
    });

    await expect(
      service.calculateAndPersist(businessId, { taxYear: 2026, periodNumber: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.simpleTaxPeriod.upsert).not.toHaveBeenCalled();
  });

  it('does not recalculate paid periods', async () => {
    prisma.simpleTaxPeriod.findUnique.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.PAID,
    });

    await expect(
      service.calculateAndPersist(businessId, { taxYear: 2026, periodNumber: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.simpleTaxPeriod.upsert).not.toHaveBeenCalled();
  });

  it('posts a period and creates balanced simple tax accounting movements', async () => {
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.CALCULATED,
      taxYear: 2026,
      periodNumber: 1,
      periodEnd: new Date('2026-02-28T23:59:59.999Z'),
      netSimpleTax: new Prisma.Decimal(800000),
    });
    prisma.simpleTaxPeriod.update.mockImplementation(async ({ data }: any) => ({
      id: 'period-1',
      ...data,
    }));

    const result = await service.postPeriod(businessId, 'period-1');

    expect(result.status).toBe(SimpleTaxPeriodStatus.POSTED);
    expect(result.accountingEntryId).toBe('simple-tax-post-period-1');
    const createManyArg = prisma.accountingMovement.createMany.mock.calls[0][0] as any;
    expect(createManyArg.data).toEqual([
      expect.objectContaining({
        pucSubcuentaId: '519595',
        amount: new Prisma.Decimal(800000),
        nature: 'DEBIT',
        originType: 'SIMPLE_TAX_PERIOD',
        originId: 'period-1',
        metadata: expect.objectContaining({
          periodId: 'period-1',
          kind: 'POST',
          taxYear: 2026,
          periodNumber: 1,
        }),
      }),
      expect.objectContaining({
        pucSubcuentaId: '219595',
        amount: new Prisma.Decimal(800000),
        nature: 'CREDIT',
        originType: 'SIMPLE_TAX_PERIOD',
        originId: 'period-1',
        metadata: expect.objectContaining({
          periodId: 'period-1',
          kind: 'POST',
          taxYear: 2026,
          periodNumber: 1,
        }),
      }),
    ]);
    expect(prisma.simpleTaxPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SimpleTaxPeriodStatus.POSTED,
          postedAt: expect.any(Date),
          accountingEntryId: 'simple-tax-post-period-1',
        }),
      }),
    );
  });

  it('posts a zero-value period without creating accounting movements', async () => {
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-zero',
      businessId,
      status: SimpleTaxPeriodStatus.CALCULATED,
      taxYear: 2026,
      periodNumber: 1,
      periodEnd: new Date('2026-02-28T23:59:59.999Z'),
      netSimpleTax: new Prisma.Decimal(0),
    });
    prisma.simpleTaxPeriod.update.mockImplementation(async ({ data }: any) => ({
      id: 'period-zero',
      ...data,
    }));

    const result = await service.postPeriod(businessId, 'period-zero');

    expect(result.status).toBe(SimpleTaxPeriodStatus.POSTED);
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    expect(result.accountingEntryId).toBeNull();
  });

  it('does not duplicate accounting movements when posting an already posted period', async () => {
    const postedPeriod = {
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.POSTED,
      accountingEntryId: 'simple-tax-post-period-1',
    };
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue(postedPeriod);

    const result = await service.postPeriod(businessId, 'period-1');

    expect(result).toBe(postedPeriod);
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    expect(prisma.simpleTaxPeriod.update).not.toHaveBeenCalled();
  });

  it('pays a posted period with BANK using 111005', async () => {
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.POSTED,
      taxYear: 2026,
      periodNumber: 1,
      netSimpleTax: new Prisma.Decimal(800000),
    });
    prisma.simpleTaxPeriod.update.mockImplementation(async ({ data }: any) => ({
      id: 'period-1',
      ...data,
    }));

    const result = await service.payPeriod(businessId, 'period-1', {
      paymentDate: '2026-03-15',
      paymentMethod: 'BANK' as any,
      paidAmount: 800000,
    });

    expect(result.status).toBe(SimpleTaxPeriodStatus.PAID);
    expect(result.paymentAccountCode).toBe('111005');
    const createManyArg = prisma.accountingMovement.createMany.mock.calls[0][0] as any;
    expect(createManyArg.data).toEqual([
      expect.objectContaining({
        pucSubcuentaId: '219595',
        nature: 'DEBIT',
        amount: new Prisma.Decimal(800000),
        originType: 'SIMPLE_TAX_PERIOD',
        originId: 'period-1',
        metadata: expect.objectContaining({
          periodId: 'period-1',
          kind: 'PAY',
          taxYear: 2026,
          periodNumber: 1,
          paymentAccountCode: '111005',
        }),
      }),
      expect.objectContaining({
        pucSubcuentaId: '111005',
        nature: 'CREDIT',
        amount: new Prisma.Decimal(800000),
        originType: 'SIMPLE_TAX_PERIOD',
        originId: 'period-1',
        metadata: expect.objectContaining({
          periodId: 'period-1',
          kind: 'PAY',
          taxYear: 2026,
          periodNumber: 1,
          paymentAccountCode: '111005',
        }),
      }),
    ]);
  });

  it('pays a posted period with CASH using 110505', async () => {
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.POSTED,
      taxYear: 2026,
      periodNumber: 1,
      netSimpleTax: new Prisma.Decimal(800000),
    });
    prisma.simpleTaxPeriod.update.mockImplementation(async ({ data }: any) => ({
      id: 'period-1',
      ...data,
    }));

    await service.payPeriod(businessId, 'period-1', {
      paymentDate: '2026-03-15',
      paymentMethod: 'CASH' as any,
      paidAmount: 800000,
    });

    const createManyArg = prisma.accountingMovement.createMany.mock.calls[0][0] as any;
    expect(createManyArg.data[1]).toEqual(
      expect.objectContaining({
        pucSubcuentaId: '110505',
        nature: 'CREDIT',
        originType: 'SIMPLE_TAX_PERIOD',
        originId: 'period-1',
        metadata: expect.objectContaining({
          periodId: 'period-1',
          kind: 'PAY',
          taxYear: 2026,
          periodNumber: 1,
          paymentAccountCode: '110505',
        }),
      }),
    );
  });

  it('does not allow paying calculated, paid, partial or duplicated payments', async () => {
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.CALCULATED,
      netSimpleTax: new Prisma.Decimal(800000),
    });
    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 800000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.PAID,
      netSimpleTax: new Prisma.Decimal(800000),
    });
    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 800000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      status: SimpleTaxPeriodStatus.POSTED,
      netSimpleTax: new Prisma.Decimal(800000),
    });
    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 799999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.accountingMovement.count.mockResolvedValue(2);
    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 800000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns BIMONTHLY_ADVANCE as the default filing mode when no config exists', async () => {
    prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue(null);

    const result = await service.getConfig(businessId);

    expect(result.filingMode).toBe(SimpleTaxFilingMode.BIMONTHLY_ADVANCE);
  });

  it('saves ANNUAL_EXCEPTION filing mode in simple tax config', async () => {
    prisma.businessSimpleTaxConfig.upsert.mockResolvedValue({
      id: 'config-1',
      businessId,
      enabled: true,
      taxYear: 2026,
      groupCode: '2',
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });

    await service.upsertConfig(businessId, {
      enabled: true,
      taxYear: 2026,
      groupCode: '2',
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });

    expect(prisma.businessSimpleTaxConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
        }),
        create: expect.objectContaining({
          filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
        }),
      }),
    );
  });

  it('does not overwrite filing mode when config payload omits it', async () => {
    prisma.businessSimpleTaxConfig.upsert.mockResolvedValue({
      id: 'config-1',
      businessId,
      enabled: true,
      taxYear: 2026,
      groupCode: '2',
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });

    await service.upsertConfig(businessId, {
      enabled: true,
      taxYear: 2026,
      groupCode: '2',
    });

    expect(prisma.businessSimpleTaxConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          filingMode: expect.anything(),
        }),
        create: expect.objectContaining({
          filingMode: SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
        }),
      }),
    );
  });

  it('calculates annual exception periods as informative only', async () => {
    prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      businessId,
      enabled: true,
      taxYear: 2026,
      groupCode: '2',
      activityLabel: null,
      ciiuCode: null,
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });
    mockSales(50000000);

    const result = await service.calculate(businessId, {
      taxYear: 2026,
      periodNumber: 1,
    });

    expect(result.response.informativeOnly).toBe(true);
    expect(result.response.filingMode).toBe(SimpleTaxFilingMode.ANNUAL_EXCEPTION);
    expect(result.response.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('modalidad anual')]),
    );
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('rejects posting bimonthly periods when annual exception is configured', async () => {
    prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue({
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });
    prisma.simpleTaxPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      businessId,
      status: SimpleTaxPeriodStatus.CALCULATED,
      netSimpleTax: new Prisma.Decimal(800000),
    });

    await expect(service.postPeriod(businessId, 'period-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    expect(prisma.simpleTaxPeriod.update).not.toHaveBeenCalled();
  });

  it('rejects bimonthly payment when annual exception is configured', async () => {
    prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue({
      filingMode: SimpleTaxFilingMode.ANNUAL_EXCEPTION,
    });

    await expect(
      service.payPeriod(businessId, 'period-1', {
        paymentDate: '2026-03-15',
        paymentMethod: 'BANK' as any,
        paidAmount: 800000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    expect(prisma.simpleTaxPeriod.update).not.toHaveBeenCalled();
  });

  describe('Consolidated Annual Simple Tax Return (RST)', () => {
    beforeEach(() => {
      prisma.simpleTaxAnnualReturn.findUnique.mockResolvedValue(null);
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue(null);
      prisma.simpleTaxAnnualReturn.upsert.mockImplementation(async (args: any) => ({
        id: 'annual-1',
        ...args.create,
      }));
      prisma.simpleTaxAnnualReturn.update.mockImplementation(async (args: any) => ({
        id: 'annual-1',
        ...args.data,
      }));
    });

    const mockAnnualRatesHelper = (groupCode = '2') => {
      const group = groups[groupCode as keyof typeof groups];
      prisma.simpleTaxRateBracket.findMany.mockResolvedValue(
        group.rows.map(([lowerUvt, upperUvt, rate]) => ({
          taxYear: 2026,
          periodType: SimpleTaxPeriodType.ANNUAL,
          groupCode,
          groupName: group.name,
          lowerUvt: new Prisma.Decimal(lowerUvt),
          upperUvt: upperUvt ? new Prisma.Decimal(upperUvt) : null,
          rate: new Prisma.Decimal(rate),
          active: true,
        })),
      );
    };

    it('calculates gross income from completed orders in the fiscal year', async () => {
      mockAnnualRatesHelper('2');
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          documentNumber: 'FV-1',
          customerName: 'C1',
          status: 'COMPLETED',
          accountingPostedAt: new Date('2026-06-15T12:00:00Z'),
          createdAt: new Date('2026-06-15T12:00:00Z'),
          total: new Prisma.Decimal(10000000),
          fiscalContext: { subtotal: new Prisma.Decimal(9000000) },
        },
      ]);
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([]);

      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.grossIncome.toString()).toBe('9000000');
    });

    it('throws error if the business does not have simple tax responsibility 47', async () => {
      prisma.businessTaxProfile.findUnique.mockResolvedValue({
        responsibilities: [{ responsibility: { code: '10' } }],
        taxSettingsEnabled: true,
      });
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.');
    });

    it('throws error if business simple tax group is not configured', async () => {
      prisma.businessSimpleTaxConfig.findUnique.mockResolvedValue({
        enabled: true,
        groupCode: null,
      });
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('Configura el grupo del Regimen Simple antes de calcular.');
    });

    it('throws error if global params (UVT) for the tax year do not exist', async () => {
      prisma.taxGlobalParameter.findUnique.mockResolvedValue(null);
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('No existe UVT configurada para 2026.');
    });

    it('throws custom error when no annual rates are configured for the year', async () => {
      prisma.simpleTaxRateBracket.findMany.mockResolvedValue([]);
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('Falta parametrizar tabla anual RST para este año fiscal.');
    });

    it('applies electronic payments discount limited to taxable gross income', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([]);
      await expect(
        service.calculateAnnualReturn(businessId, 2026, {
          taxYear: 2026,
          electronicPaymentsIncome: 1000,
        }),
      ).rejects.toThrow('Los ingresos por pagos electronicos no pueden superar la base gravable.');
    });

    it('sums netSimpleTax of POSTED or PAID bimonthly periods as advances', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([
        { id: 'p1', periodNumber: 1, netSimpleTax: new Prisma.Decimal(50000), status: SimpleTaxPeriodStatus.POSTED },
        { id: 'p2', periodNumber: 2, netSimpleTax: new Prisma.Decimal(40000), status: SimpleTaxPeriodStatus.PAID },
      ]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.bimonthlyAdvancesTotal.toString()).toBe('90000');
    });

    it('determines balance due when net annual tax exceeds bimonthly advances', async () => {
      mockAnnualRatesHelper('2');
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          documentNumber: 'FV-1',
          customerName: 'C1',
          status: 'COMPLETED',
          accountingPostedAt: new Date('2026-06-15T12:00:00Z'),
          createdAt: new Date('2026-06-15T12:00:00Z'),
          total: new Prisma.Decimal(100000000),
          fiscalContext: { subtotal: new Prisma.Decimal(100000000) },
        },
      ]);
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([
        { id: 'p1', periodNumber: 1, netSimpleTax: new Prisma.Decimal(1000000), status: SimpleTaxPeriodStatus.POSTED },
      ]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.netAnnualTax.toString()).toBe('2000000');
      expect(result.balanceDue.toString()).toBe('1000000');
      expect(result.balanceInFavor.toString()).toBe('0');
    });

    it('determines balance in favor when advances exceed net annual tax', async () => {
      mockAnnualRatesHelper('2');
      prisma.order.findMany.mockResolvedValue([]);
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([
        { id: 'p1', periodNumber: 1, netSimpleTax: new Prisma.Decimal(200000), status: SimpleTaxPeriodStatus.POSTED },
      ]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.netAnnualTax.toString()).toBe('0');
      expect(result.balanceDue.toString()).toBe('0');
      expect(result.balanceInFavor.toString()).toBe('200000');
    });

    it('determines zero balance when net annual tax matches advances', async () => {
      mockAnnualRatesHelper('2');
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'o1',
          documentNumber: 'FV-1',
          customerName: 'C1',
          status: 'COMPLETED',
          accountingPostedAt: new Date('2026-06-15T12:00:00Z'),
          createdAt: new Date('2026-06-15T12:00:00Z'),
          total: new Prisma.Decimal(100000000),
          fiscalContext: { subtotal: new Prisma.Decimal(100000000) },
        },
      ]);
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([
        { id: 'p1', periodNumber: 1, netSimpleTax: new Prisma.Decimal(2000000), status: SimpleTaxPeriodStatus.POSTED },
      ]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.netAnnualTax.toString()).toBe('2000000');
      expect(result.balanceDue.toString()).toBe('0');
      expect(result.balanceInFavor.toString()).toBe('0');
    });

    it('persists structured calculation snapshot including sales, advances and UVT info', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      const snapshot = result.calculationSnapshot as any;
      expect(snapshot).toBeDefined();
      expect(snapshot.taxYear).toBe(2026);
      expect(snapshot.uvtValue).toBe(52374);
      expect(snapshot.bracket.rate).toBe(0.016);
    });

    it('allows recalculating when the existing return is in CALCULATED status', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxAnnualReturn.findUnique.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.CALCULATED,
      });
      prisma.simpleTaxPeriod.findMany.mockResolvedValue([]);
      const result = await service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 });
      expect(result.status).toBe(SimpleTaxAnnualReturnStatus.CALCULATED);
      expect(prisma.simpleTaxAnnualReturn.upsert).toHaveBeenCalled();
    });

    it('throws error when trying to calculate and the existing return is POSTED', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxAnnualReturn.findUnique.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
      });
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('La declaracion anual RST ya esta presentada o pagada.');
    });

    it('throws error when trying to calculate and the existing return is PAID', async () => {
      mockAnnualRatesHelper('2');
      prisma.simpleTaxAnnualReturn.findUnique.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.PAID,
      });
      await expect(
        service.calculateAnnualReturn(businessId, 2026, { taxYear: 2026 }),
      ).rejects.toThrow('La declaracion anual RST ya esta presentada o pagada.');
    });

    it('throws error if presenting a return that is not in CALCULATED status', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
        balanceDue: new Prisma.Decimal(0),
      });
      await expect(service.postAnnualReturn(businessId, 'annual-1')).rejects.toThrow(
        'La declaracion anual RST ya esta presentada.',
      );
    });

    it('creates accounting entries on post when balanceDue > 0', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.CALCULATED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });

      const result = await service.postAnnualReturn(businessId, 'annual-1');
      expect(result.status).toBe(SimpleTaxAnnualReturnStatus.POSTED);
      expect(result.accountingEntryId).toBe('simple-tax-annual-post-annual-1');

      expect(prisma.accountingMovement.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              pucSubcuentaId: '519595',
              amount: new Prisma.Decimal(600000),
              nature: 'DEBIT',
              originType: 'SIMPLE_TAX_ANNUAL_RETURN',
              originId: 'annual-1',
              date: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
            }),
            expect.objectContaining({
              pucSubcuentaId: '219595',
              amount: new Prisma.Decimal(600000),
              nature: 'CREDIT',
              originType: 'SIMPLE_TAX_ANNUAL_RETURN',
              originId: 'annual-1',
              date: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
            }),
          ],
        }),
      );
    });

    it('posts successfully without generating accounting movements when balanceDue is 0', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.CALCULATED,
        balanceDue: new Prisma.Decimal(0),
        taxYear: 2026,
      });

      const result = await service.postAnnualReturn(businessId, 'annual-1');
      expect(result.status).toBe(SimpleTaxAnnualReturnStatus.POSTED);
      expect(result.accountingEntryId).toBeNull();
      expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    });

    it('throws error if paying a return that is not POSTED', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.CALCULATED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });
      await expect(
        service.payAnnualReturn(businessId, 'annual-1', {
          paymentDate: '2027-04-10',
          paymentMethod: 'CASH' as any,
          paidAmount: 600000,
        }),
      ).rejects.toThrow('La declaracion anual RST debe estar presentada antes de pagar.');
    });

    it('throws error if paidAmount does not match balanceDue exactly', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });
      await expect(
        service.payAnnualReturn(businessId, 'annual-1', {
          paymentDate: '2027-04-10',
          paymentMethod: 'CASH' as any,
          paidAmount: 500000,
        }),
      ).rejects.toThrow('Solo se permite pago total del impuesto RST.');
    });

    it('throws error if paymentMethod is BANK but bank account code is not 111005', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });
      await expect(
        service.payAnnualReturn(businessId, 'annual-1', {
          paymentDate: '2027-04-10',
          paymentMethod: 'BANK' as any,
          paymentAccountCode: '111001' as any,
          paidAmount: 600000,
        }),
      ).rejects.toThrow('La cuenta bancaria permitida es 111005.');
    });

    it('creates correct accounting movements when paying with BANK', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });

      const result = await service.payAnnualReturn(businessId, 'annual-1', {
        paymentDate: '2027-04-10',
        paymentMethod: 'BANK' as any,
        paidAmount: 600000,
      });

      expect(result.status).toBe(SimpleTaxAnnualReturnStatus.PAID);
      expect(result.paidAmount.toString()).toBe('600000');
      expect(result.paymentAccountCode).toBe('111005');

      expect(prisma.accountingMovement.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              pucSubcuentaId: '219595',
              amount: new Prisma.Decimal(600000),
              nature: 'DEBIT',
              originType: 'SIMPLE_TAX_ANNUAL_RETURN',
              originId: 'annual-1',
            }),
            expect.objectContaining({
              pucSubcuentaId: '111005',
              amount: new Prisma.Decimal(600000),
              nature: 'CREDIT',
              originType: 'SIMPLE_TAX_ANNUAL_RETURN',
              originId: 'annual-1',
            }),
          ],
        }),
      );
    });

    it('throws error if the payment has already generated accounting movements', async () => {
      prisma.simpleTaxAnnualReturn.findFirst.mockResolvedValue({
        id: 'annual-1',
        status: SimpleTaxAnnualReturnStatus.POSTED,
        balanceDue: new Prisma.Decimal(600000),
        taxYear: 2026,
      });
      prisma.accountingMovement.count.mockResolvedValue(2);

      await expect(
        service.payAnnualReturn(businessId, 'annual-1', {
          paymentDate: '2027-04-10',
          paymentMethod: 'CASH' as any,
          paidAmount: 600000,
        }),
      ).rejects.toThrow('El pago RST ya tiene movimientos contables.');
    });
  });
});
