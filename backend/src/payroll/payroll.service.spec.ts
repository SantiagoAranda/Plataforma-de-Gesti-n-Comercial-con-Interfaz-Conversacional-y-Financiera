import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingMovementOriginType,
  MovementNature,
  PayrollAccountingSide,
  PayrollAdjustmentType,
  PayrollContractType,
  PayrollPaymentCycle,
  PayrollPeriodStatus,
  PayrollSettlementStatus,
  PayrollSettlementType,
  Prisma,
  PaymentMethod,
} from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { PayrollService } from './payroll.service';

const businessId = 'biz-1';
const periodId = 'period-1';
const employeeId = 'emp-1';
const contractId = 'contract-1';

function seedPayrollAccountingMappingsFixture() {
  const filePath = path.resolve(
    __dirname,
    '../../prisma/seed-data/payroll_accounting_mapping.csv',
  );
  const rows = parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    record_delimiter: '\n',
  }) as Array<{
    concept_code: string;
    concept_name: string;
    account_code: string;
    account_name: string;
    side: PayrollAccountingSide;
  }>;

  return rows.map((row) => ({
    businessId,
    conceptCode: row.concept_code,
    conceptName: row.concept_name,
    accountCode: row.account_code,
    accountName: row.account_name,
    side: row.side,
    isActive: true,
  }));
}

function accountCodeFromMovement(movement: {
  pucCuentaCode?: string | null;
  pucSubcuentaId?: string | null;
}) {
  return movement.pucSubcuentaId ?? movement.pucCuentaCode;
}

function expectBalancedMovements(
  movements: Array<{ amount: unknown; nature: MovementNature }>,
) {
  const total = movements.reduce(
    (acc, movement) => {
      const amount = new Prisma.Decimal(
        movement.amount as Prisma.Decimal.Value,
      );
      if (movement.nature === MovementNature.DEBIT)
        acc.debit = acc.debit.add(amount);
      else acc.credit = acc.credit.add(amount);
      return acc;
    },
    { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
  );

  expect(total.debit.equals(total.credit)).toBe(true);
}

function defaultEmployee() {
  return {
    id: employeeId,
    businessId,
    firstName: 'Ana',
    lastName: 'Gomez',
    documentNumber: '123',
    documentType: 'CC',
    position: 'Asistente',
  };
}

function defaultContract() {
  return {
    id: contractId,
    businessId,
    employeeId,
    employee: defaultEmployee(),
    contractType: PayrollContractType.INDEFINITE,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    isActive: true,
    salaryMonthly: new Prisma.Decimal(3_000_000),
    isRemote: false,
    applyLaw1819: true,
    paymentCycle: PayrollPaymentCycle.MONTHLY,
    installmentsCount: 1,
    arlRiskClassId: 'arl-1',
    arlRiskClass: { id: 'arl-1', rate: new Prisma.Decimal('0.00522') },
  };
}

function defaultPeriod(status: PayrollPeriodStatus = PayrollPeriodStatus.OPEN) {
  return {
    id: periodId,
    businessId,
    year: 2026,
    month: 8,
    paymentCycle: PayrollPaymentCycle.MONTHLY,
    installmentNumber: 1,
    status,
  };
}

function enabledPeriodicPayrollPeriod(
  status: PayrollPeriodStatus = PayrollPeriodStatus.OPEN,
) {
  return { ...defaultPeriod(status), month: 8 };
}

function approvedOvertimeEvent(
  date: string,
  code: string,
  quantity = 1,
) {
  return {
    id: `event-${date}-${code}`,
    businessId,
    employeeId,
    payrollPeriodId: periodId,
    payrollRunId: null,
    type: 'OVERTIME',
    status: 'APPROVED',
    startDate: new Date(`${date}T00:00:00.000Z`),
    endDate: null,
    quantity: new Prisma.Decimal(quantity),
    unit: 'HOURS',
    overtimeCode: code,
    amountOverride: null,
    notes: null,
  };
}

function defaultGlobalParameter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'global-2026',
    legalCode: 'CO-PAYROLL-2026-V1',
    year: 2026,
    version: 1,
    isActive: true,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    smmlv: 1_750_905,
    transportAllowance: 249_095,
    weeklyHours: 44,
    monthlyHours: 220,
    dailyHours: 8,
    maxWorkedDaysMonth: 30,
    maxSupplementaryHours: 720,
    healthEmployeeRate: 0.04,
    pensionEmployeeRate: 0.04,
    healthEmployerRate: 0.085,
    pensionEmployerRate: 0.12,
    compensationFundRate: 0.04,
    senaRate: 0.02,
    icbfRate: 0.03,
    severanceRate: 0.0833,
    severanceInterestRate: 0.12,
    serviceBonusRate: 0.0833,
    vacationRate: 0.0417,
    law1819ThresholdSmmlv: 10,
    transportLimitSmmlv: 2,
    withholdingStatus: 'DISABLED_FOR_FUTURE_UPDATE',
    ...overrides,
  };
}

function normalizedOvertimeRates(
  overrides: Array<{ code: string; name: string; factor: number }> = [],
) {
  const surchargeCodes = new Set([
    'HORA_ORDINARIA_NOCTURNA',
    'HORA_DOMINICAL_FESTIVO',
    'HORA_DOM_FESTIVO_NOCTURNO',
  ]);
  const defaults = [
    ['HORA_ORDINARIA_NOCTURNA', 'Recargo nocturno', 1.35],
    ['HORA_EXTRA_DIURNA', 'Extra diurna', 1.25],
    ['HORA_EXTRA_NOCTURNO', 'Extra nocturna', 1.75],
    ['HORA_DOMINICAL_FESTIVO', 'Recargo dominical/festivo', 1.8],
    ['HORA_DOM_FESTIVO_NOCTURNO', 'Recargo nocturno dominical/festivo', 2.15],
    ['HORA_EXTRA_DOM_FESTIVO', 'Extra dom/festiva', 2.05],
    ['HORA_EXTRA_NOCTURNO_DOM_FESTIVO', 'Extra nocturna dom/festiva', 2.55],
  ] as const;
  const byCode = new Map(overrides.map((rate) => [rate.code, rate]));
  return defaults.map(([code, defaultName, defaultFactor]) => {
    const override = byCode.get(code);
    const totalFactor = new Prisma.Decimal(override?.factor ?? defaultFactor);
    const surchargeOnly = surchargeCodes.has(code);
    return {
      code,
      name: override?.name ?? defaultName,
      legalPercentage: totalFactor.sub(1).mul(100).toString(),
      totalFactor: totalFactor.toString(),
      payableMultiplier: surchargeOnly
        ? totalFactor.sub(1).toString()
        : totalFactor.toString(),
      calculationMode: surchargeOnly ? 'SURCHARGE_ONLY' : 'FULL_HOUR_FACTOR',
      isActive: true,
    };
  });
}

function globalParameterForReference(referenceDate: Date) {
  const timestamp = referenceDate.getTime();
  if (timestamp < Date.parse('2026-07-01T00:00:00.000Z')) {
    return defaultGlobalParameter({
      id: 'global-2026-v1',
      version: 1,
      legalCode: 'CO-PAYROLL-2026-V1',
      effectiveTo: new Date('2026-07-01T00:00:00.000Z'),
    });
  }
  if (timestamp < Date.parse('2026-07-15T00:00:00.000Z')) {
    return defaultGlobalParameter({
      id: 'global-2026-v2',
      version: 2,
      legalCode: 'CO-PAYROLL-2026-V2',
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-07-15T00:00:00.000Z'),
    });
  }
  return defaultGlobalParameter({
    id: 'global-2026-v3',
    version: 3,
    legalCode: 'CO-PAYROLL-2026-V3',
    weeklyHours: 42,
    monthlyHours: 210,
    effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
    effectiveTo: null,
  });
}

function overtimeRatesForGlobalParameter(globalParameterId: string) {
  if (globalParameterId === 'global-2026-v1') {
    return normalizedOvertimeRates();
  }
  return normalizedOvertimeRates([
    {
      code: 'HORA_DOMINICAL_FESTIVO',
      name: 'Recargo dominical/festivo',
      factor: 1.9,
    },
    {
      code: 'HORA_DOM_FESTIVO_NOCTURNO',
      name: 'Recargo nocturno dominical/festivo',
      factor: 2.25,
    },
    {
      code: 'HORA_EXTRA_DOM_FESTIVO',
      name: 'Extra dom/festiva',
      factor: 2.15,
    },
    {
      code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
      name: 'Extra nocturna dom/festiva',
      factor: 2.65,
    },
  ]);
}

function createPrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'emp-1',
        businessId: 'biz-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        position: 'Asistente de Direccion Tecnica',
      }),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    employeeContract: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payrollRun: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          severance: null,
          severanceInterest: null,
          serviceBonus: null,
          vacation: null,
          salaryEarned: null,
          netPay: null,
        },
      }),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    payrollContractSettlement: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payrollContractSettlementLine: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payrollPayment: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payrollPeriod: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'period-1',
        businessId: 'biz-1',
        year: 2026,
        month: 8,
        paymentCycle: PayrollPaymentCycle.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
      }),
    },
    payrollPeriodPreparation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    payrollOvertimeRate: {
      findMany: jest.fn().mockResolvedValue(normalizedOvertimeRates()),
    },
    payrollEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
    },
    payrollSolidarityBracket: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollArlRiskClass: {
      findFirst: jest.fn().mockResolvedValue({ id: 'arl-1' }),
    },
    economicActivityCiiu: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ciiu-1' }),
    },
    payrollBusinessParameter: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    payrollGlobalParameter: {
      findFirst: jest.fn().mockResolvedValue(defaultGlobalParameter()),
    },
    payrollConceptResult: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payrollAdjustment: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    accountingMovement: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollAccountingMapping: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    pucCuenta: {
      findUnique: jest.fn().mockResolvedValue({ code: '2505' }),
    },
    pucSubcuenta: {
      findFirst: jest.fn().mockResolvedValue({ code: '510506' }),
    },
    payrollBenefitPayment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
      callback(base),
    ),
  };

  return Object.assign(base, overrides);
}

describe('PayrollService payroll history rules', () => {
  it.each([
    ['2026-06-30', 1, 44, 220, '1.8', '0.8'],
    ['2026-07-01', 2, 44, 220, '1.9', '0.9'],
    ['2026-07-14', 2, 44, 220, '1.9', '0.9'],
    ['2026-07-15', 3, 42, 210, '1.9', '0.9'],
  ])(
    'selects the exact legal validity on %s',
    async (
      referenceDate,
      version,
      weeklyHours,
      monthlyHours,
      sundayFactor,
      sundayPayable,
    ) => {
      const prisma = createPrismaMock();
      prisma.payrollGlobalParameter.findFirst.mockImplementation(
        ({ where }: any) =>
          Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
      );
      prisma.payrollOvertimeRate.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          overtimeRatesForGlobalParameter(where.globalParameterId),
        ),
      );
      const service = new PayrollService(prisma as any);

      const config: any = await service.getGlobalConfig('2026', referenceDate);
      const rates: any[] = await service.listOvertimeRates(
        '2026',
        referenceDate,
      );
      const sunday = rates.find(
        (rate) => rate.code === 'HORA_DOMINICAL_FESTIVO',
      );

      expect(config.version).toBe(version);
      expect(Number(config.weeklyHours)).toBe(weeklyHours);
      expect(Number(config.monthlyHours)).toBe(monthlyHours);
      expect(String(sunday.totalFactor)).toBe(sundayFactor);
      expect(String(sunday.payableMultiplier)).toBe(sundayPayable);
    },
  );

  it('normalizes July 2026 sunday and holiday-night factors without concept hardcodes', async () => {
    const rates = overtimeRatesForGlobalParameter('global-2026-v2');
    expect(rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HORA_DOM_FESTIVO_NOCTURNO',
          legalPercentage: '125',
          totalFactor: '2.25',
          payableMultiplier: '1.25',
          calculationMode: 'SURCHARGE_ONLY',
        }),
        expect.objectContaining({
          code: 'HORA_EXTRA_DOM_FESTIVO',
          totalFactor: '2.15',
          payableMultiplier: '2.15',
          calculationMode: 'FULL_HOUR_FACTOR',
        }),
        expect.objectContaining({
          code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
          totalFactor: '2.65',
          payableMultiplier: '2.65',
          calculationMode: 'FULL_HOUR_FACTOR',
        }),
      ]),
    );
  });

  it('ignores legacy business legal overrides and snapshots the selected validity', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findFirst.mockResolvedValue({
      ...defaultPeriod(),
      month: 8,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
    });
    prisma.employeeContract.findFirst.mockResolvedValue(defaultContract());
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      weeklyHours: new Prisma.Decimal(44),
      monthlyHours: new Prisma.Decimal(220),
      customSmmlv: new Prisma.Decimal(1_300_000),
      customTransportAllowance: new Prisma.Decimal(100_000),
    });
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.payrollOvertimeRate.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(overtimeRatesForGlobalParameter(where.globalParameterId)),
    );
    const service = new PayrollService(prisma as any);
    prisma.payrollEvent.findMany.mockResolvedValue([
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_DIURNA'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_NOCTURNO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_DOMINICAL_FESTIVO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_DOM_FESTIVO_NOCTURNO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_DOM_FESTIVO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO'),
    ]);

    const preview: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(preview.usedParameters).toEqual(
      expect.objectContaining({
        legalParameterId: 'global-2026-v3',
        legalCode: 'CO-PAYROLL-2026-V3',
        legalVersion: 3,
        referenceDate: '2026-08-31T00:00:00.000Z',
        weeklyHours: '42',
        monthlyHours: '210',
      }),
    );
    expect(preview.usedParameters.overtimeRates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HORA_DOMINICAL_FESTIVO',
          totalFactor: '1.9',
          payableMultiplier: '0.9',
          calculationMode: 'SURCHARGE_ONLY',
        }),
      ]),
    );
  });

  it('declares an idempotent database exclusion constraint for active legal ranges', () => {
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../prisma/migrations/20260725130000_payroll_legal_effective_dates_2026/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('EXCLUDE USING gist');
    expect(migration).toContain('WHERE ("isActive")');
    expect(migration).toContain('ON CONFLICT ("globalParameterId", "code")');
    expect(migration).not.toContain('DELETE FROM "PayrollOvertimeRate"');
  });

  it('keeps the seed idempotent and sources all three validities from one CSV', () => {
    const seed = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/seed.ts'),
      'utf8',
    );
    const csvPath = path.resolve(
      __dirname,
      '../../prisma/seed-data/payroll_global_parameters.csv',
    );
    const rows = parse(fs.readFileSync(csvPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>;

    expect(rows.map((row) => row.legal_code)).toEqual([
      'CO-PAYROLL-2026-V1',
      'CO-PAYROLL-2026-V2',
      'CO-PAYROLL-2026-V3',
    ]);
    expect(seed).toContain('where: { legalCode: r.legal_code }');
    expect(seed).toContain('update: {}');
    expect(seed).not.toContain('path.join(base, "horas.csv")');
    expect(seed).not.toMatch(
      /payroll(?:OvertimeRate|SolidarityBracket)\.deleteMany/,
    );
  });

  it('rejects new business overrides for global legal values', async () => {
    const service = new PayrollService(createPrismaMock() as any);
    await expect(
      service.updateBusinessConfig(businessId, '2026', {
        weeklyHours: 44,
      }),
    ).rejects.toThrow(
      'Los parámetros legales globales no admiten overrides por negocio: weeklyHours',
    );
  });

  it('does not recalculate a payroll run that already has a paid payment', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPayment.count.mockResolvedValue(1);
    prisma.payrollPeriod.findFirst.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    prisma.payrollPeriod.findUnique.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    const service = new PayrollService(prisma as any);

    await expect(
      service.calculateEmployeePayroll(businessId, periodId, employeeId, {}),
    ).rejects.toThrow(
      'La nómina tiene pagos realizados y no puede recalcularse.',
    );
    expect(prisma.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it('keeps employer health and pension accounting mapping to one debit and one credit each', () => {
    const mappings = seedPayrollAccountingMappingsFixture();

    for (const conceptCode of ['EMPLOYER_HEALTH', 'EMPLOYER_PENSION']) {
      const conceptMappings = mappings.filter(
        (mapping) => mapping.conceptCode === conceptCode,
      );
      expect(
        conceptMappings.filter(
          (mapping) => mapping.side === PayrollAccountingSide.DEBIT,
        ),
      ).toHaveLength(1);
      expect(
        conceptMappings.filter(
          (mapping) => mapping.side === PayrollAccountingSide.CREDIT,
        ),
      ).toHaveLength(1);
    }
  });

  it('blocks employee inactivation when an active contract exists', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({ id: 'contract-1' });
    const service = new PayrollService(prisma as any);

    await expect(
      service.deleteEmployee('biz-1', 'emp-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('hard deletes an employee only when there is no payroll history', async () => {
    const prisma = createPrismaMock();
    const service = new PayrollService(prisma as any);

    await expect(service.hardDeleteEmployee('biz-1', 'emp-1')).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(prisma.employee.delete).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
    });
  });

  it('blocks critical contract edits when the contract has posted payroll', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      salaryMonthly: 3_000_000,
    });
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'run-1',
      period: { status: PayrollPeriodStatus.POSTED },
    });
    const service = new PayrollService(prisma as any);

    await expect(
      service.updateContract('biz-1', 'contract-1', {
        salaryMonthly: 3_500_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employeeContract.update).not.toHaveBeenCalled();
  });

  it('validates an active contract edit with the legal configuration effective today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue(defaultContract());
    prisma.payrollRun.findFirst.mockResolvedValue(null);
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.employeeContract.update.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
    });
    const service = new PayrollService(prisma as any);

    try {
      await service.updateContract(businessId, contractId, {
        salaryMonthly: 1_750_905,
      });
      expect(prisma.payrollGlobalParameter.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            effectiveFrom: {
              lte: new Date('2026-07-25T00:00:00.000Z'),
            },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses day-based monthly provisions for salary 1.750.905', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: true,
      isIncomeTaxFiler: true,
      legalPersonType: 'LEGAL_ENTITY',
      employeeCountForExemption: 3,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: 1_750_905,
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      {
        workedDays: 30,
        commissions: 0,
        nonSalaryBonus: 0,
        otherDeductions: 0,
      },
    );

    expect(Number(result.salaryEarned)).toBeCloseTo(1_750_905, 2);
    expect(Number(result.transportAllowance)).toBeCloseTo(249_095, 2);
    expect(Number(result.grossIncome)).toBeCloseTo(2_000_000, 2);
    expect(Number(result.employeeHealth)).toBe(70_036);
    expect(Number(result.employeePension)).toBe(70_036);
    expect(Number(result.netPay)).toBe(1_859_928);
    expect(Number(result.employerHealth)).toBe(0);
    expect(Number(result.employerPension)).toBe(210_109);
    expect(Number(result.employerArl)).toBe(9_140);
    expect(Number(result.compensationFund)).toBe(70_036);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(Number(result.severance)).toBe(166_600);
    expect(Number(result.severanceInterest)).toBe(19_992);
    expect(Number(result.serviceBonus)).toBe(166_600);
    expect(Number(result.serviceBonusPreview)).toBe(999_600);
    expect(Number(result.vacation)).toBe(73_013);
    expect(Math.round(Number(result.totalBenefits))).toBe(426_205);
    expect(Math.round(Number(result.realEmployerCost))).toBe(2_715_489);
  });

  it('exempts SENA and ICBF below 10 SMMLV when Law 1819 employer health exemption is disabled', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: false,
      isIncomeTaxFiler: false,
      legalPersonType: 'LEGAL_ENTITY',
      employeeCountForExemption: null,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: 3_000_000,
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      { workedDays: 30 },
    );

    expect(Number(result.salaryEarned)).toBe(3_000_000);
    expect(Number(result.transportAllowance)).toBe(249_095);
    expect(Number(result.employeeHealth)).toBe(120_000);
    expect(Number(result.employeePension)).toBe(120_000);
    expect(Number(result.netPay)).toBe(3_009_095);
    expect(Number(result.employerHealth)).toBe(255_000);
    expect(Number(result.employerPension)).toBe(360_000);
    expect(Number(result.employerArl)).toBe(15_660);
    expect(Number(result.compensationFund)).toBe(120_000);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(Number(result.severance)).toBe(270_650);
    expect(Number(result.severanceInterest)).toBe(32_478);
    expect(Number(result.serviceBonus)).toBe(270_650);
    expect(Number(result.vacation)).toBe(125_100);
    expect(Number(result.totalEmployerContributions)).toBe(630_660);
    expect(Number(result.totalParafiscals)).toBe(120_000);
    expect(Number(result.totalBenefits)).toBe(698_877);
    expect(Number(result.realEmployerCost)).toBe(4_698_632);
    expect(result.usedParameters.costFormula).toBe(
      'TOTAL_ACCRUED_PLUS_EMPLOYER_CONTRIBUTIONS_AND_PROVISIONS',
    );
    expect(result.usedParameters.totalAccrued).toBe('3249095');
    expect(result.usedParameters.netPay).toBe('3009095');
    expect(result.usedParameters.employeeDeductions).toBe('240000');
    expect(result.usedParameters.employerContributions).toBe('630660');
    expect(result.usedParameters.socialBenefits).toBe('698877');
    expect(result.usedParameters.parafiscals).toBe('120000');
    expect(result.usedParameters.law1819Applied).toBe(false);
    expect(result.usedParameters.exemptEmployerHealthLaw1819).toBe(false);
    expect(result.usedParameters.benefitProfile).toBe(
      'DATAICO_TRUNCATED_MONTHLY',
    );
    expect(result.usedParameters.severanceFormulaApplied).toBe(
      'benefitBase * severanceRate',
    );
    expect(result.usedParameters.serviceBonusFormulaApplied).toBe(
      'benefitBase * serviceBonusRate',
    );
    expect(result.usedParameters.vacationFormulaApplied).toBe(
      'vacationBase * vacationRate',
    );
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_SEVERANCE_INTEREST_RATE',
    );
  });

  it('does not grant transport or connectivity allowance above 2 SMMLV', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(4_000_000),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.salaryEarned)).toBe(4_000_000);
    expect(Number(result.transportAllowance)).toBe(0);
    expect(Number(result.connectivityAllowance)).toBe(0);
    expect(Number(result.employeeHealth)).toBe(160_000);
    expect(Number(result.employeePension)).toBe(160_000);
    expect(Number(result.netPay)).toBe(3_680_000);
    expect(Number(result.severance)).toBe(333_200);
    expect(Number(result.severanceInterest)).toBe(39_984);
    expect(Number(result.serviceBonus)).toBe(333_200);
    expect(Number(result.vacation)).toBe(166_800);
    expect(Number(result.totalEmployerContributions)).toBe(500_880);
    expect(Number(result.totalParafiscals)).toBe(160_000);
    expect(Number(result.totalBenefits)).toBe(873_184);
    expect(Number(result.realEmployerCost)).toBe(5_534_064);
    expect(Number(result.serviceBonusPreview)).toBe(1_999_200);
  });

  it('uses the configured annual severance interest rate for monthly provisions', async () => {
    const prisma = createPrismaMock();
    prisma.payrollGlobalParameter.findFirst.mockResolvedValue(
      defaultGlobalParameter({ severanceInterestRate: 0.1 }),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(4_000_000),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.severance)).toBe(333_200);
    expect(Number(result.severanceInterest)).toBe(33_320);
    expect(result.usedParameters.monthlySeveranceInterestRate).toBe('0.1');
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_SEVERANCE_INTEREST_RATE',
    );
  });

  it('grants connectivity instead of transport for a remote employee at or below 2 SMMLV', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: true,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.transportAllowance)).toBe(0);
    expect(Number(result.connectivityAllowance)).toBe(249_095);
    expect(Number(result.grossIncome)).toBe(2_000_000);
  });

  it('applies Law 1819 for a qualifying legal entity business and salary 4.000.000', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: true,
      isIncomeTaxFiler: true,
      legalPersonType: 'LEGAL_ENTITY',
      employeeCountForExemption: 3,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(4_000_000),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.employerHealth)).toBe(0);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(Number(result.compensationFund)).toBe(160_000);
    expect(Number(result.employerPension)).toBe(480_000);
    expect(Number(result.employerArl)).toBe(20_880);
    expect(Number(result.totalEmployerContributions)).toBe(500_880);
    expect(Number(result.totalParafiscals)).toBe(160_000);
    expect(Number(result.totalBenefits)).toBe(873_184);
    expect(Number(result.realEmployerCost)).toBe(5_534_064);
    expect(result.usedParameters.law1819Applied).toBe(true);
  });

  it('keeps employer health but exempts SENA and ICBF below 10 SMMLV without Law 1819', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: false,
      exemptEmployerHealthLaw1819: false,
      isIncomeTaxFiler: false,
      legalPersonType: 'LEGAL_ENTITY',
      employeeCountForExemption: 3,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(4_000_000),
      isRemote: false,
      applyLaw1819: false,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.netPay)).toBe(3_680_000);
    expect(Number(result.employerHealth)).toBe(340_000);
    expect(Number(result.employerPension)).toBe(480_000);
    expect(Number(result.employerArl)).toBe(20_880);
    expect(Number(result.compensationFund)).toBe(160_000);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(Number(result.totalEmployerContributions)).toBe(840_880);
    expect(Number(result.totalParafiscals)).toBe(160_000);
    expect(Number(result.totalBenefits)).toBe(873_184);
    expect(Number(result.realEmployerCost)).toBe(5_874_064);
    expect(result.usedParameters.law1819Applied).toBe(false);
  });

  it('uses official real employer cost with Law 1819 employer health exemption', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: true,
      isIncomeTaxFiler: true,
      legalPersonType: 'LEGAL_ENTITY',
      employeeCountForExemption: 3,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: 3_000_000,
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      { workedDays: 30 },
    );

    expect(Number(result.grossIncome)).toBe(3_249_095);
    expect(Number(result.totalEmployeeDeductions)).toBe(240_000);
    expect(Number(result.netPay)).toBe(3_009_095);
    expect(Number(result.employerHealth)).toBe(0);
    expect(Number(result.employerPension)).toBe(360_000);
    expect(Number(result.employerArl)).toBe(15_660);
    expect(Number(result.totalEmployerContributions)).toBe(375_660);
    expect(Number(result.compensationFund)).toBe(120_000);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(Number(result.totalParafiscals)).toBe(120_000);
    expect(Number(result.severance)).toBe(270_650);
    expect(Number(result.severanceInterest)).toBe(32_478);
    expect(Number(result.serviceBonus)).toBe(270_650);
    expect(Number(result.vacation)).toBe(125_100);
    expect(Number(result.totalBenefits)).toBe(698_877);
    expect(Number(result.realEmployerCost)).toBe(4_443_632);
    expect(result.usedParameters.costFormula).toBe(
      'TOTAL_ACCRUED_PLUS_EMPLOYER_CONTRIBUTIONS_AND_PROVISIONS',
    );
    expect(result.usedParameters.totalAccrued).toBe('3249095');
    expect(result.usedParameters.netPay).toBe('3009095');
    expect(result.usedParameters.employeeDeductions).toBe('240000');
    expect(result.usedParameters.employerContributions).toBe('375660');
    expect(result.usedParameters.socialBenefits).toBe('698877');
    expect(result.usedParameters.parafiscals).toBe('120000');
    expect(result.usedParameters.law1819Applied).toBe(true);
    expect(result.usedParameters.exemptEmployerHealthLaw1819).toBe(true);
    expect(result.usedParameters.benefitProfile).toBe(
      'DATAICO_TRUNCATED_MONTHLY',
    );
    expect(result.usedParameters.severanceFormulaApplied).toBe(
      'benefitBase * severanceRate',
    );
    expect(result.usedParameters.serviceBonusFormulaApplied).toBe(
      'benefitBase * serviceBonusRate',
    );
    expect(result.usedParameters.vacationFormulaApplied).toBe(
      'vacationBase * vacationRate',
    );
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_SEVERANCE_INTEREST_RATE',
    );
  });

  it('does not apply Law 1819 when salary is at least 10 SMMLV', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(18_000_000),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.transportAllowance)).toBe(0);
    expect(Number(result.connectivityAllowance)).toBe(0);
    expect(Number(result.employerHealth)).toBe(1_530_000);
    expect(Number(result.employerPension)).toBe(2_160_000);
    expect(Number(result.compensationFund)).toBe(720_000);
    expect(Number(result.sena)).toBe(360_000);
    expect(Number(result.icbf)).toBe(540_000);
    expect(result.usedParameters.law1819Applied).toBe(false);
  });

  it('applies health, SENA and ICBF when salary is exactly 10 SMMLV', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(17_509_050),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.employerHealth)).toBeGreaterThan(0);
    expect(Number(result.sena)).toBeGreaterThan(0);
    expect(Number(result.icbf)).toBeGreaterThan(0);
    expect(Number(result.employerPension)).toBeGreaterThan(0);
    expect(Number(result.employerArl)).toBeGreaterThan(0);
    expect(Number(result.compensationFund)).toBeGreaterThan(0);
    expect(result.usedParameters.law1819Applied).toBe(false);
  });

  it('applies employer health Law 1819 exemption independently from SENA and ICBF below 10 SMMLV', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: true,
      isIncomeTaxFiler: true,
      legalPersonType: 'NATURAL_PERSON',
      employeeCountForExemption: 2,
      applySolidarityFund: true,
      applyIncomeTax: false,
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      { workedDays: 30 },
    );

    expect(Number(result.employerHealth)).toBe(0);
    expect(Number(result.employerPension)).toBe(360_000);
    expect(Number(result.compensationFund)).toBe(120_000);
    expect(Number(result.sena)).toBe(0);
    expect(Number(result.icbf)).toBe(0);
    expect(result.usedParameters.law1819Applied).toBe(true);
    expect(result.usedParameters.legalPersonType).toBe('NATURAL_PERSON');
    expect(result.usedParameters.law1819EmployeeCountForExemption).toBe(2);
  });

  it('keeps transport in severance and service bonus base but excludes it from vacation', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: 3_000_000,
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      { workedDays: 30 },
    );

    expect(Number(result.severance)).toBe(270_650);
    expect(Number(result.serviceBonus)).toBe(270_650);
    expect(Number(result.severanceInterest)).toBe(32_478);
    expect(Number(result.vacation)).toBe(125_100);
  });

  it('provisions monthly severance interest as monthly severance times 12 percent', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: 3_000_000,
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      { workedDays: 30 },
    );

    expect(Number(result.severance)).toBe(270_650);
    expect(Number(result.severanceInterest)).toBe(32_478);
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_SEVERANCE_INTEREST_RATE',
    );
  });

  it('returns the existing payroll period when the unique key already exists', async () => {
    const prisma = createPrismaMock();
    const existing = {
      id: 'period-existing',
      businessId: 'biz-1',
      year: 2026,
      month: 5,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentNumber: 1,
      status: PayrollPeriodStatus.OPEN,
    };
    prisma.payrollPeriod.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.payrollPeriod.findUnique.mockResolvedValue(existing);
    const service = new PayrollService(prisma as any);

    await expect(
      service.createPayrollPeriod('biz-1', {
        year: 2026,
        month: 5,
        paymentCycle: PayrollPaymentCycle.MONTHLY,
      }),
    ).resolves.toBe(existing);
  });

  it('allows creating August 2026 while today is July 2026', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findUnique.mockResolvedValue(null);
    prisma.payrollPeriod.create.mockResolvedValue({
      ...enabledPeriodicPayrollPeriod(),
      id: 'period-august',
    });
    const service = new PayrollService(prisma as any);

    try {
      await expect(
        service.createPayrollPeriod(businessId, {
          year: 2026,
          month: 8,
          paymentCycle: PayrollPaymentCycle.MONTHLY,
        }),
      ).resolves.toEqual(expect.objectContaining({ month: 8, year: 2026 }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows a new July 2026 periodic payroll and keeps existing history readable', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findUnique.mockResolvedValueOnce(null);
    const created = {
      ...defaultPeriod(PayrollPeriodStatus.OPEN),
      month: 7,
    };
    prisma.payrollPeriod.create.mockResolvedValueOnce(created);
    const service = new PayrollService(prisma as any);

    try {
      await expect(
        service.createPayrollPeriod(businessId, {
          year: 2026,
          month: 7,
          paymentCycle: PayrollPaymentCycle.MONTHLY,
        }),
      ).resolves.toEqual(created);
      expect(prisma.payrollPeriod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId,
          year: 2026,
          month: 7,
          paymentCycle: PayrollPaymentCycle.MONTHLY,
          installmentNumber: 1,
          status: PayrollPeriodStatus.OPEN,
        }),
      });

      const historical = {
        ...defaultPeriod(PayrollPeriodStatus.CLOSED),
        month: 7,
      };
      prisma.payrollPeriod.findUnique.mockResolvedValueOnce(historical);
      await expect(
        service.createPayrollPeriod(businessId, {
          year: 2026,
          month: 7,
          paymentCycle: PayrollPaymentCycle.MONTHLY,
        }),
      ).resolves.toBe(historical);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not allow preparing an arbitrarily future payroll period', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findUnique.mockResolvedValue(null);
    const service = new PayrollService(prisma as any);

    try {
      await expect(
        service.createPayrollPeriod(businessId, {
          year: 2026,
          month: 9,
          paymentCycle: PayrollPaymentCycle.MONTHLY,
        }),
      ).rejects.toThrow(
        'Solo se permite preparar el mes actual o el mes inmediatamente siguiente.',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('continues blocking June periodic payroll before daily calculation is available', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findFirst.mockResolvedValue({
      ...defaultPeriod(),
      month: 6,
    });
    const service = new PayrollService(prisma as any);

    await expect(
      service.calculateEmployeePayroll(businessId, periodId, employeeId, {}),
    ).rejects.toThrow(
      'Las nÃ³minas anteriores a agosto de 2026 requieren cÃ¡lculo por vigencias diarias y todavÃ­a no estÃ¡n habilitadas.',
    );
    expect(prisma.payrollRun.upsert).not.toHaveBeenCalled();
  });

  it('uses V3 for the complete August manual overtime case', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findFirst.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
    });
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.payrollOvertimeRate.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(overtimeRatesForGlobalParameter(where.globalParameterId)),
    );
    const service = new PayrollService(prisma as any);
    prisma.payrollEvent.findMany.mockResolvedValue([
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_DIURNA'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_NOCTURNO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_DOMINICAL_FESTIVO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_DOM_FESTIVO_NOCTURNO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_DOM_FESTIVO'),
      approvedOvertimeEvent('2026-08-10', 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO'),
    ]);

    const preview: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
      },
    );

    expect(preview.usedParameters).toEqual(
      expect.objectContaining({
        legalCode: 'CO-PAYROLL-2026-V3',
        weeklyHours: '42',
        monthlyHours: '210',
        referenceDate: '2026-08-31T00:00:00.000Z',
      }),
    );
    expect(
      preview.usedParameters.overtimeHours.map((item: any) => ({
        code: item.overtimeCode,
        amount: Number(item.amount),
        multiplier: item.payableMultiplier,
      })),
    ).toEqual([
      { code: 'HORA_EXTRA_DIURNA', amount: 10_422, multiplier: '1.25' },
      { code: 'HORA_EXTRA_NOCTURNO', amount: 14_591, multiplier: '1.75' },
      { code: 'HORA_DOMINICAL_FESTIVO', amount: 7_504, multiplier: '0.9' },
      {
        code: 'HORA_DOM_FESTIVO_NOCTURNO',
        amount: 10_422,
        multiplier: '1.25',
      },
      {
        code: 'HORA_EXTRA_DOM_FESTIVO',
        amount: 17_926,
        multiplier: '2.15',
      },
      {
        code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
        amount: 22_095,
        multiplier: '2.65',
      },
    ]);
  });

  it('allows contractual settlement for an employee hired before August 2026', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue(defaultContract());
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.payrollOvertimeRate.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(overtimeRatesForGlobalParameter(where.globalParameterId)),
    );
    const service = new PayrollService(prisma as any);

    const settlement: any = await service.simulateContractSettlement(
      businessId,
      contractId,
      { endDate: '2026-08-31', calculationYear: 2026 },
    );

    expect(settlement.startDate.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(settlement.calculationEndDate.toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
  });

  it('keeps frontend payroll legal values sourced from the backend response', () => {
    const page = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../frontend/app/(app)/nomina/page.tsx',
      ),
      'utf8',
    );
    const api = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../frontend/src/lib/payroll/api.ts',
      ),
      'utf8',
    );

    expect(page).toMatch(/payrollApi\s*\.\s*getLegalConfig/);
    expect(page).toContain('HORA_DOM_FESTIVO_NOCTURNO');
    expect(page).not.toMatch(/\+80%|\+105%|\+155%|44 horas|220 horas/);
    const writablePayloads = api.slice(
      api.indexOf('export type CreateEmployeePayload'),
      api.indexOf('const shouldLogPayroll'),
    );
    expect(writablePayloads).not.toMatch(
      /weeklyHours\s*:|monthlyHours\s*:|customSmmlv\s*:|customTransportAllowance\s*:/,
    );
  });

  it('treats an insufficient-prima-provision response as a confirmation step, not a frontend error', () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, '../../../frontend/app/(app)/nomina/page.tsx'),
      'utf8',
    );
    const api = fs.readFileSync(
      path.resolve(__dirname, '../../../frontend/src/lib/payroll/api.ts'),
      'utf8',
    );
    const regularizationLogging = api.slice(
      api.indexOf('const isRegularizationConflict'),
      api.indexOf('      } else {', api.indexOf('const isRegularizationConflict')),
    );

    expect(regularizationLogging).toContain('console.info');
    expect(regularizationLogging).not.toContain('console.error');
    expect(page).toContain('setRegularizationModal({');
    expect(page).toContain('title="Regularización necesaria"');
    expect(page).toContain('Confirmar pago y regularización');
    expect(page).toContain('submittingPrimaRef.current');
    expect(page).toContain('regularizeMissingProvision: true');
    expect(page).toContain(
      'Prima pagada y regularización contable registrada.',
    );
  });

  it('limits a future requested end date to the current semester cutoff for 2026', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-02T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2027-02-04', calculationYear: 2026 },
    );

    expect(result.effectiveStartDate.toISOString()).toBe(
      '2026-06-02T00:00:00.000Z',
    );
    expect(result.effectiveEndDate.toISOString()).toBe(
      '2026-06-30T00:00:00.000Z',
    );
    expect(result.requestedEndDate.toISOString()).toBe(
      '2027-02-04T00:00:00.000Z',
    );
    expect(result.calculationYear).toBe(2026);
    expect(result.settlementScope).toBe('CURRENT_SEMESTER_CUTOFF');
    expect(result.causedDays).toBe(29);
    expect(result.totalWorkedDays).toBe(29);
    expect(result.semesterOneDays).toBe(29);
    expect(result.semesterTwoDays).toBe(0);
    expect(result.semester1Days).toBe(29);
    expect(result.semester2Days).toBe(0);
    expect(Number(result.severance)).toBe(161_111);
    expect(Number(result.severanceInterest)).toBe(1_557);
    expect(Number(result.serviceBonusSemesterOne)).toBe(161_111);
    expect(Number(result.serviceBonusSemesterTwo)).toBe(0);
    expect(Number(result.serviceBonusSemester1)).toBe(161_111);
    expect(Number(result.serviceBonusSemester2)).toBe(0);
    expect(Number(result.vacation)).toBe(70_523);
    expect(Number(result.totalAmount)).toBe(394_302);
    expect(result.usedParameters.effectiveStartDate).toBe(
      '2026-06-02T00:00:00.000Z',
    );
    expect(result.usedParameters.effectiveEndDate).toBe(
      '2026-06-30T00:00:00.000Z',
    );
  });

  it('uses the configured annual severance interest rate for contract settlement', async () => {
    const prisma = createPrismaMock();
    prisma.payrollGlobalParameter.findFirst.mockResolvedValue(
      defaultGlobalParameter({ severanceInterestRate: 0.1 }),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-02T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2027-02-04', calculationYear: 2026 },
    );

    expect(Number(result.severance)).toBe(161_111);
    expect(Number(result.severanceInterest)).toBe(1_298);
    expect(result.usedParameters.severanceInterestRate).toBe('0.1');
    expect(result.usedParameters.formulas.severanceInterest).toBe(
      'severance * severanceInterestRate * causedDays / 360',
    );
    expect(result.usedParameters.formulas.severanceInterest).not.toContain(
      '0.12',
    );
  });

  it('uses 30/360 labor days for a full commercial year', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.semester1Days).toBe(180);
    expect(result.semester2Days).toBe(180);
    expect(result.causedDays).toBe(360);
    expect(Number(result.severance)).toBe(2_000_000);
    expect(Number(result.severanceInterest)).toBe(240_000);
    expect(Number(result.serviceBonusSemester1)).toBe(1_000_000);
    expect(Number(result.serviceBonusSemester2)).toBe(1_000_000);
    expect(Number(result.vacation)).toBe(875_453);
    expect(Number(result.totalAmount)).toBe(5_115_453);
    expect(result.usedParameters.dayCountBasis).toBe('30/360');
  });

  it('calculates the full-year settlement from rounded payable lines', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(2_000_000),
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      businessId,
      contractId,
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.causedDays).toBe(360);
    expect(Number(result.severance)).toBe(2_249_095);
    expect(Number(result.severanceInterest)).toBe(269_891);
    expect(Number(result.serviceBonusSemesterOne)).toBe(1_124_548);
    expect(Number(result.serviceBonusSemesterTwo)).toBe(1_124_548);
    expect(Number(result.vacation)).toBe(1_000_000);
    expect(Number(result.totalAmount)).toBe(5_768_082);
    expect(Number(result.totalAmount)).toBe(
      Number(result.severance) +
        Number(result.severanceInterest) +
        Number(result.serviceBonusSemesterOne) +
        Number(result.serviceBonusSemesterTwo) +
        Number(result.vacation),
    );
    expect(result.usedParameters.severanceInterestDivisor).toBe(360);
    expect(result.usedParameters.rawSeveranceInterest).toBe('269891.4');
    expect(result.usedParameters.roundedSeveranceInterest).toBe('269891');
    expect(result.usedParameters.rawServiceBonusSemester1).toBe('1124547.5');
    expect(result.usedParameters.roundedServiceBonusSemester1).toBe(
      '1124548',
    );
  });

  it.each([
    {
      name: 'does not discount service bonus without an effective payment',
      payments: [],
      expectedSemesterOne: 1_124_548,
      expectedTotal: 5_768_082,
    },
    {
      name: 'discounts a fully paid first-semester service bonus',
      payments: [
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'PAID',
          year: 2026,
          semester: 1,
          amount: new Prisma.Decimal(1_124_548),
        },
      ],
      expectedSemesterOne: 0,
      expectedTotal: 4_643_534,
    },
    {
      name: 'discounts only the amount paid for a partially paid first-semester service bonus',
      payments: [
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'PAID',
          year: 2026,
          semester: 1,
          amount: new Prisma.Decimal(500_000),
        },
      ],
      expectedSemesterOne: 624_548,
      expectedTotal: 5_268_082,
    },
    {
      name: 'never makes a service-bonus balance negative after an overpayment',
      payments: [
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'PAID',
          year: 2026,
          semester: 1,
          amount: new Prisma.Decimal(2_000_000),
        },
      ],
      expectedSemesterOne: 0,
      expectedTotal: 4_643_534,
    },
    {
      name: 'ignores cancelled, other-contract, other-year and other-semester service-bonus payments',
      payments: [
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'CANCELLED',
          year: 2026,
          semester: 1,
          amount: new Prisma.Decimal(1_124_548),
        },
        {
          businessId,
          employeeId,
          contractId: 'other-contract',
          type: 'PRIMA',
          status: 'PAID',
          year: 2026,
          semester: 1,
          amount: new Prisma.Decimal(1_124_548),
        },
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'PAID',
          year: 2025,
          semester: 1,
          amount: new Prisma.Decimal(1_124_548),
        },
        {
          businessId,
          employeeId,
          contractId,
          type: 'PRIMA',
          status: 'PAID',
          year: 2026,
          semester: 3,
          amount: new Prisma.Decimal(1_124_548),
        },
      ],
      expectedSemesterOne: 1_124_548,
      expectedTotal: 5_768_082,
    },
  ])('$name', async ({ payments, expectedSemesterOne, expectedTotal }) => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(2_000_000),
    });
    prisma.payrollBenefitPayment.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        payments.filter(
          (payment) =>
            payment.businessId === where.businessId &&
            payment.employeeId === where.employeeId &&
            payment.contractId === where.contractId &&
            payment.type === where.type &&
            payment.status === where.status &&
            payment.year === where.year &&
            where.semester.in.includes(payment.semester),
        ),
      ),
    );
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      businessId,
      contractId,
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(Number(result.serviceBonusSemesterOne)).toBe(expectedSemesterOne);
    expect(Number(result.serviceBonusSemesterTwo)).toBe(1_124_548);
    expect(Number(result.totalAmount)).toBe(expectedTotal);
  });

  it('uses the sent endDate for 2026-06-03 to 2026-12-31 without MVP future cutoff', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-03T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.requestedEndDate.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
    expect(result.effectiveStartDate.toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
    expect(result.effectiveEndDate.toISOString()).toBe(
      '2026-12-31T00:00:00.000Z',
    );
    expect(result.settlementScope).toBe('CURRENT_YEAR');
    expect(result.semester1Days).toBe(28);
    expect(result.semester2Days).toBe(180);
    expect(result.causedDays).toBe(208);
    expect(Number(result.severance)).toBe(1_155_556);
    expect(Number(result.severanceInterest)).toBe(80_119);
    expect(Number(result.serviceBonusSemester1)).toBe(155_556);
    expect(Number(result.serviceBonusSemester2)).toBe(1_000_000);
    expect(Number(result.vacation)).toBe(505_817);
    expect(Number(result.totalAmount)).toBe(2_897_048);
  });

  it('matches the Excel informative settlement fields for 2026-06-04 to 2026-12-31', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-04T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.semester1Days).toBe(27);
    expect(result.semester2Days).toBe(180);
    expect(result.causedDays).toBe(207);
    expect(Number(result.severance)).toBe(1_150_000);
    expect(Number(result.severanceInterest)).toBe(79_350);
    expect(Number(result.serviceBonusSemester1)).toBe(150_000);
    expect(Number(result.serviceBonusSemester2)).toBe(1_000_000);
    expect(Number(result.vacation)).toBe(503_385);
    expect(Number(result.totalAmount)).toBe(2_882_735);
    expect(Number(result.vacationDays)).toBe(8.7);
    expect(Number(result.hourlyRate)).toBeCloseTo(1_750_905 / 220, 1);
    expect(result.usedParameters.vacationDaysRaw).toBe('8.625');
    expect(result.usedParameters.vacationDaysFormula).toBe(
      'causedDays * 15 / 360',
    );
    expect(result.usedParameters.vacationDaysRounding).toBe('CEIL_1_DECIMAL');
    expect(result.usedParameters.monthlyPayrollHours).toBe('220');
    expect(
      result.usedParameters.settlementInformativeHourlyDivisor,
    ).toBeUndefined();
    expect(result.usedParameters.hourlyRateSource).toBe('LEGAL_MONTHLY_HOURS');
  });

  it('uses monthlyHours for both operational and informative settlement hourly rates', async () => {
    const prisma = createPrismaMock();
    prisma.payrollOvertimeRate.findMany.mockResolvedValue(
      normalizedOvertimeRates([
        { code: 'HORA_EXTRA_DIURNA', name: 'Extra diurna', factor: 1.25 },
      ]),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-04T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);
    prisma.payrollEvent.findMany.mockResolvedValue([
      approvedOvertimeEvent('2026-07-12', 'HORA_EXTRA_DIURNA', 720),
    ]);

    const monthlyPreview: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      {
        workedDays: 30,
      },
    );
    const settlement: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    const operationalHourlyRate =
      Number(monthlyPreview.overtimeAmount) / 720 / 1.25;
    expect(operationalHourlyRate).toBeCloseTo(1_750_905 / 220, 3);
    expect(operationalHourlyRate).toBeCloseTo(7_958.659, 3);
    expect(Number(settlement.hourlyRate)).toBeCloseTo(1_750_905 / 220, 1);
    expect(settlement.usedParameters.monthlyPayrollHours).toBe('220');
    expect(
      settlement.usedParameters.settlementInformativeHourlyDivisor,
    ).toBeUndefined();
    expect(settlement.usedParameters.hourlyRateSource).toBe(
      'LEGAL_MONTHLY_HOURS',
    );
  });

  it('rejects aggregate overtimeHours and requires a dated payroll event', async () => {
    const prisma = createPrismaMock();
    prisma.payrollOvertimeRate.findMany.mockResolvedValue(
      normalizedOvertimeRates([
        { code: 'HORA_EXTRA_DIURNA', name: 'Extra diurna', factor: 1.25 },
      ]),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: defaultEmployee(),
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(2_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);

    await expect(
      service.previewEmployeePayroll('biz-1', 'period-1', 'emp-1', {
        workedDays: 30,
        overtimeHours: [{ type: 'OVERTIME_DAY', quantity: 2 }],
      }),
    ).rejects.toThrow(
      'Las horas extra deben registrarse como una novedad fechada del período.',
    );
  });

  it('calculates preview overtime for every frontend-supported backend rate code', async () => {
    const prisma = createPrismaMock();
    const rates = [
      { code: 'HORA_EXTRA_DIURNA', name: 'Extra diurna', factor: 1.25 },
      { code: 'HORA_EXTRA_NOCTURNO', name: 'Extra nocturna', factor: 1.75 },
      {
        code: 'HORA_ORDINARIA_NOCTURNA',
        name: 'Recargo nocturno',
        factor: 1.35,
      },
      {
        code: 'HORA_EXTRA_DOM_FESTIVO',
        name: 'Extra dom/festiva',
        factor: 2.05,
      },
      {
        code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
        name: 'Extra nocturna dom/festiva',
        factor: 2.55,
      },
      {
        code: 'HORA_DOMINICAL_FESTIVO',
        name: 'Recargo dominical/festivo',
        factor: 1.8,
      },
    ];
    prisma.payrollOvertimeRate.findMany.mockResolvedValue(
      normalizedOvertimeRates(rates),
    );
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: defaultEmployee(),
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(2_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
      arlRiskClass: { id: 'arl-1', rate: 0.00522 },
    });
    const service = new PayrollService(prisma as any);
    const events = rates.map((rate) =>
      approvedOvertimeEvent('2026-08-10', rate.code, 2),
    );
    prisma.payrollEvent.findMany.mockResolvedValue(events);

    const preview: any = await service.previewEmployeePayroll(
      'biz-1',
      'period-1',
      'emp-1',
      {
        workedDays: 30,
      },
    );

    expect(Number(preview.overtimeAmount)).toBeGreaterThan(0);
    const snapshotEvents = preview.usedParameters.events;
    expect(snapshotEvents).toHaveLength(rates.length);
    expect(new Set(snapshotEvents.map((event: any) => event.overtimeCode)).size).toBe(rates.length);
    expect(snapshotEvents.map((event: any) => event.overtimeCode).sort()).toEqual(
      rates.map((rate) => rate.code).sort(),
    );
    for (const event of snapshotEvents) {
      expect(event).toEqual(expect.objectContaining({
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
      }));
      expect(Number(event.payableMultiplier)).toBeGreaterThan(0);
      expect(Number(event.hourlyRate)).toBeCloseTo(2_000_000 / 210, 8);
      expect(Number(event.amount)).toBeGreaterThan(0);
    }
  });

  it('uses only surcharge multipliers for nocturnal and sunday surcharge overtime concepts', async () => {
    const prisma = createPrismaMock();
    const rates = [
      { code: 'HORA_EXTRA_DIURNA', name: 'Extra diurna', factor: 1.25 },
      { code: 'HORA_EXTRA_NOCTURNO', name: 'Extra nocturna', factor: 1.75 },
      {
        code: 'HORA_ORDINARIA_NOCTURNA',
        name: 'Recargo nocturno',
        factor: 1.35,
      },
      {
        code: 'HORA_EXTRA_DOM_FESTIVO',
        name: 'Extra dom/festiva',
        factor: 2.05,
      },
      {
        code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
        name: 'Extra nocturna dom/festiva',
        factor: 2.55,
      },
      {
        code: 'HORA_DOMINICAL_FESTIVO',
        name: 'Recargo dominical/festivo',
        factor: 1.8,
      },
    ];
    prisma.payrollOvertimeRate.findMany.mockResolvedValue(
      normalizedOvertimeRates(rates),
    );
    prisma.payrollGlobalParameter.findFirst.mockImplementation(
      ({ where }: any) =>
        Promise.resolve(globalParameterForReference(where.effectiveFrom.lte)),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
    });
    const service = new PayrollService(prisma as any);
    const events = rates.map((rate) =>
      approvedOvertimeEvent('2026-08-10', rate.code, 2),
    );
    prisma.payrollEvent.findMany.mockResolvedValue(events);

    const preview: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
      },
    );

    expect(Number(preview.overtimeAmount)).toBe(145_909);
    expect(preview.usedParameters.events).toEqual([
      expect.objectContaining({
        overtimeCode: 'HORA_EXTRA_DIURNA',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '1.25',
        hourlyRate: '8337.6428571428571429',
        amount: '20844',
      }),
      expect.objectContaining({
        overtimeCode: 'HORA_EXTRA_NOCTURNO',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '1.75',
        hourlyRate: '8337.6428571428571429',
        amount: '29182',
      }),
      expect.objectContaining({
        overtimeCode: 'HORA_ORDINARIA_NOCTURNA',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '0.35',
        hourlyRate: '8337.6428571428571429',
        amount: '5836',
      }),
      expect.objectContaining({
        overtimeCode: 'HORA_EXTRA_DOM_FESTIVO',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '2.05',
        hourlyRate: '8337.6428571428571429',
        amount: '34184',
      }),
      expect.objectContaining({
        overtimeCode: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '2.55',
        hourlyRate: '8337.6428571428571429',
        amount: '42522',
      }),
      expect.objectContaining({
        overtimeCode: 'HORA_DOMINICAL_FESTIVO',
        quantity: '2',
        legalCode: 'CO-PAYROLL-2026-V3',
        monthlyHours: '210',
        payableMultiplier: '0.8',
        hourlyRate: '8337.6428571428571429',
        amount: '13340',
      }),
    ]);

    let runRecord: any;
    let conceptResults: any[] = [];
    prisma.payrollRun.upsert.mockImplementation(({ create }: any) => {
      runRecord = { id: 'run-overtime-1', ...create };
      return Promise.resolve(runRecord);
    });
    prisma.payrollConceptResult.createMany.mockImplementation(
      ({ data }: any) => {
        conceptResults = data;
        return Promise.resolve({ count: data.length });
      },
    );
    prisma.payrollRun.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...runRecord,
        employee: defaultEmployee(),
        contract: {
          ...defaultContract(),
          salaryMonthly: new Prisma.Decimal(1_750_905),
        },
        adjustments: [],
        conceptResults,
        payments: [],
      }),
    );
    prisma.payrollPeriod.findFirst.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    prisma.payrollPeriod.findUnique.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );

    const persisted: any = await service.calculateEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
      },
    );

    const overtimeConcept = conceptResults.find(
      (concept) => concept.code === 'OVERTIME_TOTAL',
    );
    expect(Number(persisted.overtimeAmount)).toBe(145_909);
    expect(Number(overtimeConcept.amount)).toBe(145_909);
    expect(prisma.payrollEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: events.map((event) => event.id) } },
      data: { status: 'APPLIED', payrollRunId: 'run-overtime-1' },
    });
    expect(runRecord.usedParameters.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          overtimeCode: 'HORA_ORDINARIA_NOCTURNA',
          legalCode: 'CO-PAYROLL-2026-V3',
          monthlyHours: '210',
          payableMultiplier: '0.35',
        }),
        expect.objectContaining({
          overtimeCode: 'HORA_DOMINICAL_FESTIVO',
          legalCode: 'CO-PAYROLL-2026-V3',
          monthlyHours: '210',
          payableMultiplier: '0.8',
        }),
      ]),
    );
    expect(runRecord.usedParameters.events).toHaveLength(rates.length);
    for (const previewEvent of preview.usedParameters.events) {
      expect(runRecord.usedParameters.events).toContainEqual(
        expect.objectContaining({
          overtimeCode: previewEvent.overtimeCode,
          quantity: '2',
          legalCode: 'CO-PAYROLL-2026-V3',
          monthlyHours: '210',
          payableMultiplier: previewEvent.payableMultiplier,
          hourlyRate: previewEvent.hourlyRate,
          amount: previewEvent.amount,
        }),
      );
    }
  });

  it('uses Dataico payroll bases after overtime without inflating social security or vacation', async () => {
    const prisma = createPrismaMock();
    const rates = [
      { code: 'HORA_EXTRA_DIURNA', name: 'Extra diurna', factor: 1.25 },
      { code: 'HORA_EXTRA_NOCTURNO', name: 'Extra nocturna', factor: 1.75 },
      {
        code: 'HORA_ORDINARIA_NOCTURNA',
        name: 'Recargo nocturno',
        factor: 1.35,
      },
      {
        code: 'HORA_EXTRA_DOM_FESTIVO',
        name: 'Extra dom/festiva',
        factor: 2.05,
      },
      {
        code: 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
        name: 'Extra nocturna dom/festiva',
        factor: 2.55,
      },
      {
        code: 'HORA_DOMINICAL_FESTIVO',
        name: 'Recargo dominical/festivo',
        factor: 1.8,
      },
    ];
    prisma.payrollOvertimeRate.findMany.mockResolvedValue(
      normalizedOvertimeRates(rates),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
      applyLaw1819: false,
    });
    const service = new PayrollService(prisma as any);
    const events = rates.map((rate) =>
      approvedOvertimeEvent('2026-08-10', rate.code, 2),
    );
    prisma.payrollEvent.findMany.mockResolvedValue(events);

    const preview: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
      },
    );

    expect(Number(preview.overtimeAmount)).toBe(139_277);
    expect(Number(preview.grossIncome)).toBe(2_139_277);
    expect(Number(preview.ibcAmount)).toBe(1_890_182);
    expect(Number(preview.employeeHealth)).toBe(75_607);
    expect(Number(preview.employeePension)).toBe(75_607);
    expect(Number(preview.employerHealth)).toBe(160_665);
    expect(Number(preview.employerPension)).toBe(226_822);
    expect(Number(preview.employerArl)).toBe(9_867);
    expect(Number(preview.compensationFund)).toBe(75_607);
    expect(Number(preview.sena) + Number(preview.icbf)).toBe(0);
    expect(Number(preview.severance)).toBe(178_202);
    expect(Number(preview.severanceInterest)).toBe(21_384);
    expect(Number(preview.serviceBonus)).toBe(178_202);
    expect(Number(preview.vacation)).toBe(73_013);
    expect(Number(preview.realEmployerCost)).toBe(3_063_038);
    expect(preview.usedParameters.overtimeAmount).toBe('139277');
    expect(preview.usedParameters.events).toHaveLength(rates.length);
    expect(preview.usedParameters.events.map((event) => event.overtimeCode)).toEqual(
      rates.map((rate) => rate.code),
    );
    expect(preview.usedParameters.ibcBasePolicy).toBe(
      'SALARY_EARNED_PLUS_COMMISSIONS_PLUS_OVERTIME_EXCLUDES_TRANSPORT_AND_NON_SALARY_BONUS',
    );
    expect(preview.usedParameters.ibcBase).toBe('1890181.5340909090909');
    expect(preview.usedParameters.benefitBaseWithTransportPolicy).toBe(
      'DATAICO_MONTHLY_SEVERANCE_AND_SERVICE_BONUS_INCLUDE_TRANSPORT_CONNECTIVITY_COMMISSIONS_AND_OVERTIME',
    );
    expect(preview.usedParameters.benefitBaseWithTransport).toBe(
      '2139276.5340909090909',
    );
    expect(preview.usedParameters.vacationBasePolicy).toBe(
      'DATAICO_MONTHLY_VACATION_EXCLUDES_TRANSPORT_CONNECTIVITY_AND_OVERTIME',
    );
    expect(preview.usedParameters.vacationBase).toBe('1750905');
    expect(preview.usedParameters.overtimeIncludedInIbc).toBe(true);
    expect(preview.usedParameters.overtimeIncludedInBenefits).toBe(true);
    expect(preview.usedParameters.overtimeIncludedInVacation).toBe(false);
  });

  it('keeps loan deduction separated from other deductions in monthly payroll calculations', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
    });
    const service = new PayrollService(prisma as any);

    const preview: any = await service.previewEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
        commissions: 100,
        nonSalaryBonus: 100,
        loanDeduction: 100,
        otherDeductions: 100,
      },
    );

    expect(Number(preview.commissions)).toBe(100);
    expect(Number(preview.nonSalaryBonus)).toBe(100);
    expect(Number(preview.loanDeduction)).toBe(100);
    expect(Number(preview.otherDeductions)).toBe(100);
    expect(Number(preview.grossIncome)).toBe(2_000_200);
    expect(Number(preview.ibcAmount)).toBe(1_751_005);
    expect(Number(preview.netPay)).toBe(1_859_920);
    expect(preview.usedParameters.loanDeduction).toBe('100');
    expect(preview.usedParameters.otherDeductions).toBe('100');
    expect(preview.usedParameters.deductionsBreakdown).toEqual({
      loanDeduction: '100',
      otherDeductions: '100',
    });
    expect(preview.usedParameters.benefitBaseWithTransport).toBe('2000100');
    expect(preview.usedParameters.vacationBase).toBe('1751005');
  });

  it('persists loan deduction separately through used parameters and payroll adjustments', async () => {
    const prisma = createPrismaMock();
    let runRecord: any;
    let conceptResults: any[] = [];
    prisma.payrollPeriod.findFirst.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    prisma.payrollPeriod.findUnique.mockResolvedValue(
      enabledPeriodicPayrollPeriod(),
    );
    prisma.employeeContract.findFirst.mockResolvedValue({
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(1_750_905),
    });
    prisma.payrollRun.upsert.mockImplementation(({ create }: any) => {
      runRecord = { id: 'run-novelties-1', ...create };
      return Promise.resolve(runRecord);
    });
    prisma.payrollConceptResult.createMany.mockImplementation(
      ({ data }: any) => {
        conceptResults = data;
        return Promise.resolve({ count: data.length });
      },
    );
    prisma.payrollRun.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...runRecord,
        employee: defaultEmployee(),
        contract: {
          ...defaultContract(),
          salaryMonthly: new Prisma.Decimal(1_750_905),
        },
        adjustments: [],
        conceptResults,
        payments: [],
      }),
    );
    const service = new PayrollService(prisma as any);

    const persisted: any = await service.calculateEmployeePayroll(
      businessId,
      periodId,
      employeeId,
      {
        workedDays: 30,
        commissions: 100,
        nonSalaryBonus: 100,
        loanDeduction: 100,
        otherDeductions: 100,
      },
    );

    const loanConcept = conceptResults.find(
      (concept) => concept.code === 'LOAN_DEDUCTION',
    );
    const otherConcept = conceptResults.find(
      (concept) => concept.code === 'OTHER_DEDUCTIONS',
    );
    expect(Number(persisted.commissions)).toBe(100);
    expect(Number(persisted.nonSalaryBonus)).toBe(100);
    expect(Number(persisted.loanDeduction)).toBe(100);
    expect(Number(persisted.otherDeductions)).toBe(100);
    expect(Number(loanConcept.amount)).toBe(100);
    expect(Number(otherConcept.amount)).toBe(100);
    expect(runRecord.usedParameters.deductionsBreakdown).toEqual({
      loanDeduction: '100',
      otherDeductions: '100',
    });
    expect(prisma.payrollAdjustment.createMany).toHaveBeenCalledWith({
      data: [
        {
          payrollRunId: 'run-novelties-1',
          type: PayrollAdjustmentType.LOAN_DEDUCTION,
          amount: new Prisma.Decimal(100),
          description: 'Prestamos',
        },
      ],
    });
  });

  it('applies current semester cutoff only when the sent endDate is in 2027 for calculation year 2026', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-03T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2027-06-03', calculationYear: 2026 },
    );

    expect(result.requestedEndDate.toISOString()).toBe(
      '2027-06-03T00:00:00.000Z',
    );
    expect(result.effectiveStartDate.toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
    expect(result.effectiveEndDate.toISOString()).toBe(
      '2026-06-30T00:00:00.000Z',
    );
    expect(result.settlementScope).toBe('CURRENT_SEMESTER_CUTOFF');
    expect(result.semester1Days).toBe(28);
    expect(result.semester2Days).toBe(0);
    expect(result.causedDays).toBe(28);
  });

  it('uses 30/360 labor days for second semester from 2026-07-01 to 2026-12-31', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.semester1Days).toBe(0);
    expect(result.semester2Days).toBe(180);
    expect(result.causedDays).toBe(180);
  });

  it('uses 30/360 labor days from 2026-08-15 to 2026-12-31', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(1_750_905),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    expect(result.semester1Days).toBe(0);
    expect(result.semester2Days).toBe(136);
    expect(result.causedDays).toBe(136);
  });

  it('settles 2026-03-06 to 2027-03-06 from January 1 of settlement year', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-03-06T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2027-03-06' },
    );

    expect(result.cutoffStartDate.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
    expect(result.settlementDate.toISOString()).toBe(
      '2027-03-06T00:00:00.000Z',
    );
    expect(result.causedDays).toBe(66);
    expect(result.totalWorkedDays).toBe(66);
    expect(result.semesterOneDays).toBe(66);
    expect(result.semesterTwoDays).toBe(0);
    expect(result.semester1Days).toBe(66);
    expect(result.semester2Days).toBe(0);
    expect(Number(result.serviceBonus)).toBe(595_667);
    expect(Number(result.totalAmount)).toBe(1_479_439);
  });

  it('settles 2026-06-03 to 2027-06-03 using only calculation year 2027', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-03T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2027-06-03', calculationYear: 2027 },
    );

    expect(result.cutoffStartDate.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
    expect(result.settlementDate.toISOString()).toBe(
      '2027-06-03T00:00:00.000Z',
    );
    expect(result.causedDays).toBe(153);
    expect(result.totalWorkedDays).toBe(153);
    expect(result.semesterOneDays).toBe(153);
    expect(result.semesterTwoDays).toBe(0);
    expect(result.semester1Days).toBe(153);
    expect(result.semester2Days).toBe(0);
    expect(Number(result.severance)).toBe(1_380_865);
    expect(Number(result.severanceInterest)).toBe(70_424);
    expect(Number(result.serviceBonusSemesterOne)).toBe(1_380_865);
    expect(Number(result.serviceBonusSemesterTwo)).toBe(0);
    expect(Number(result.vacation)).toBe(637_500);
    expect(Number(result.totalAmount)).toBe(3_469_654);
    expect(result.usedParameters.originalContractStartDate).toBe(
      '2026-06-03T00:00:00.000Z',
    );
    expect(result.usedParameters.cutoffStartDate).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('does not reconcile annual settlement against historical payroll provisions', async () => {
    const prisma = createPrismaMock();
    prisma.payrollRun.aggregate.mockResolvedValue({
      _sum: {
        severance: new Prisma.Decimal(1_353_250),
        severanceInterest: new Prisma.Decimal(67_689),
        serviceBonus: new Prisma.Decimal(1_353_250),
        vacation: new Prisma.Decimal(625_500),
        salaryEarned: new Prisma.Decimal(15_000_000),
        netPay: new Prisma.Decimal(15_045_475),
      },
    });
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-31T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-07-01' },
    );

    expect(Number(result.benefitsProvisioned.total)).toBe(0);
    expect(Number(result.benefitsCalculated.total)).toBe(3_423_391);
    expect(Number(result.reconciliationDifference)).toBe(0);
    expect(Number(result.reconciliationPercent)).toBe(0);
    expect(result.benefitsReconciliation).toEqual({});
  });

  it('settles an explicit inclusive endDate from 2026-01-01 to 2026-06-01', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-06-01' },
    );

    expect(result.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(result.usedParameters.requestedEndDate).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(result.usedParameters.calculationEndDate).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(result.cutoffStartDate.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(result.settlementDate.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(result.causedDays).toBe(151);
    expect(result.totalWorkedDays).toBe(151);
    expect(result.semesterOneDays).toBe(151);
    expect(result.semesterTwoDays).toBe(0);
    expect(Number(result.severance)).toBe(1_362_815);
    expect(Number(result.severanceInterest)).toBe(68_595);
    expect(Number(result.serviceBonus)).toBe(1_362_815);
    expect(Number(result.serviceBonusTotal)).toBe(1_362_815);
    expect(Number(result.vacation)).toBe(629_167);
    expect(Number(result.benefitsTotal)).toBe(3_423_392);
    expect(Number(result.salaryPending)).toBe(0);
    expect(result.salaryPendingAvailable).toBe(false);
    expect(Number(result.settlementTotalPayable)).toBe(3_423_392);
    expect(Number(result.totalAmount)).toBe(3_423_392);
    expect(result.usedParameters.daysWorkedTotal360).toBe(151);
    expect(result.usedParameters.daysWorkedSemester1).toBe(151);
    expect(result.usedParameters.daysWorkedSemester2).toBe(0);
    expect(result.usedParameters.daysWorkedForVacation).toBe(151);
  });

  it('splits service bonus between semesters for 2026-06-03 to 2026-08-15', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-06-03T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-08-15', calculationYear: 2026 },
    );

    expect(result.effectiveStartDate.toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
    expect(result.effectiveEndDate.toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
    expect(result.settlementScope).toBe('CURRENT_YEAR');
    expect(result.causedDays).toBe(73);
    expect(result.semesterOneDays).toBe(28);
    expect(result.semesterTwoDays).toBe(45);
    expect(result.semester1Days).toBe(28);
    expect(result.semester2Days).toBe(45);
    expect(Number(result.severance)).toBe(658_844);
    expect(Number(result.severanceInterest)).toBe(16_032);
    expect(Number(result.serviceBonusSemesterOne)).toBe(252_707);
    expect(Number(result.serviceBonusSemesterTwo)).toBe(406_137);
    expect(Number(result.vacation)).toBe(304_167);
    expect(Number(result.benefitsTotal)).toBe(1_637_887);
    expect(result.usedParameters.daysWorkedSemester1).toBe(28);
    expect(result.usedParameters.daysWorkedSemester2).toBe(45);
  });

  it('hides salary pending from annual settlement when payment integration is incomplete', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPayment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal(3_009_095),
        type: 'SALARY_PAYMENT',
        payrollRun: {
          salaryEarned: new Prisma.Decimal(3_000_000),
          netPay: new Prisma.Decimal(3_009_095),
        },
      },
    ]);
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    const result: any = await service.simulateContractSettlement(
      'biz-1',
      'contract-1',
      { endDate: '2026-06-01' },
    );

    expect(Number(result.salaryPending)).toBe(0);
    expect(result.salaryPendingAvailable).toBe(false);
    expect(Number(result.grossSalaryPaid)).toBe(0);
    expect(Number(result.netSalaryPaid)).toBe(0);
    expect(Number(result.benefitsTotal)).toBe(3_423_392);
    expect(Number(result.settlementTotalPayable)).toBe(3_423_392);
    expect(result.usedParameters.salaryPaid).toBe('0');
    expect(result.usedParameters.salaryPending).toBe('0');
    expect(result.usedParameters.salaryPendingHiddenReason).toBeDefined();
  });

  it('uses today as an inclusive calculation date when settlement simulation has no endDate', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-02T13:45:00.000Z'));
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      businessId: 'biz-1',
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Gomez',
        documentNumber: '123',
        documentType: 'CC',
        position: 'Asistente',
      },
      contractType: PayrollContractType.INDEFINITE,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: null,
      isActive: true,
      salaryMonthly: new Prisma.Decimal(3_000_000),
      isRemote: false,
      applyLaw1819: true,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentsCount: 1,
      arlRiskClassId: 'arl-1',
    });
    const service = new PayrollService(prisma as any);

    try {
      const result: any = await service.simulateContractSettlement(
        'biz-1',
        'contract-1',
        {},
      );

      expect(result.endDate.toISOString()).toBe('2026-06-02T00:00:00.000Z');
      expect(result.usedParameters.requestedEndDate).toBe(
        '2026-06-02T00:00:00.000Z',
      );
      expect(result.usedParameters.calculationEndDate).toBe(
        '2026-06-02T00:00:00.000Z',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not create accounting movements from monthly preview', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue(defaultContract());
    const service = new PayrollService(prisma as any);

    await service.previewEmployeePayroll(businessId, periodId, employeeId, {});

    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('does not create accounting movements from contract settlement simulation', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue(defaultContract());
    const service = new PayrollService(prisma as any);

    await service.simulateContractSettlement(businessId, contractId, {
      endDate: '2026-12-31',
      calculationYear: 2026,
    });

    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('blocks monthly payroll liquidation when the period is already posted', async () => {
    const prisma = createPrismaMock();
    prisma.payrollPeriod.findFirst.mockResolvedValue(
      defaultPeriod(PayrollPeriodStatus.POSTED),
    );
    const service = new PayrollService(prisma as any);
    const calculateSpy = jest.spyOn(service, 'calculatePeriodPayroll');

    await expect(
      service.liquidatePeriodPayroll(businessId, periodId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calculateSpy).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('rejects preparation with no applicable employees before creating a period', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.count.mockResolvedValue(0);
    const service = new PayrollService(prisma as any);

    await expect(service.preparePayrollPeriod(businessId, {
      year: 2026,
      month: 8,
      paymentCycle: PayrollPaymentCycle.MONTHLY,
      installmentNumber: null,
      idempotencyKey: 'prepare-empty-employees',
    })).rejects.toThrow('NO_APPLICABLE_PAYROLL_EMPLOYEES');

    expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
    expect(prisma.payrollRun.upsert).not.toHaveBeenCalled();
    expect(prisma.payrollPayment.createMany).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('liquidates monthly payroll and creates balanced accounting movements with seed mappings', async () => {
    const prisma = createPrismaMock();
    const period = enabledPeriodicPayrollPeriod();
    const employee = defaultEmployee();
    const contract = defaultContract();
    const mappings = seedPayrollAccountingMappingsFixture();
    const mappingCodes = new Set(
      mappings.map((mapping) => mapping.accountCode),
    );
    let runRecord: any;
    let conceptResults: any[] = [];

    prisma.payrollPeriod.findFirst.mockResolvedValue(period);
    prisma.payrollPeriod.findUnique.mockResolvedValue(period);
    prisma.employee.findMany.mockResolvedValue([employee]);
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employeeContract.findFirst.mockResolvedValue(contract);
    prisma.payrollAccountingMapping.findMany.mockImplementation((args: any) => {
      const codes = args.where.conceptCode.in as string[];
      return Promise.resolve(
        mappings.filter((mapping) => codes.includes(mapping.conceptCode)),
      );
    });
    prisma.payrollRun.upsert.mockImplementation(({ create }: any) => {
      runRecord = {
        id: 'run-1',
        ...create,
        employee,
        contract,
      };
      return Promise.resolve(runRecord);
    });
    prisma.payrollConceptResult.createMany.mockImplementation(
      ({ data }: any) => {
        conceptResults = data;
        return Promise.resolve({ count: data.length });
      },
    );
    prisma.payrollRun.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...runRecord,
        employee,
        contract,
        adjustments: [],
        conceptResults,
        payments: [],
      }),
    );
    prisma.payrollRun.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          ...runRecord,
          employee,
          contract,
          adjustments: [],
          conceptResults,
          payments: [],
        },
      ]),
    );
    prisma.payrollPeriod.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...period, ...data }),
    );
    const service = new PayrollService(prisma as any);

    const result = await service.liquidatePeriodPayroll(businessId, periodId);

    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(result.calculatedRuns).toBe(1);
    expect(prisma.payrollRun.upsert).toHaveBeenCalled();
    expect(prisma.payrollAccountingMapping.upsert).toHaveBeenCalled();
    const upsertArgs = prisma.payrollRun.upsert.mock.calls[0][0];
    expect(upsertArgs.create.serviceBonusPreview).toBeUndefined();
    expect(upsertArgs.update.serviceBonusPreview).toBeUndefined();
    expect(upsertArgs.create.serviceBonus).toBeDefined();
    expect(upsertArgs.create.usedParameters.serviceBonusPreview).toBeDefined();
    expect(prisma.payrollPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayrollPeriodStatus.POSTED }),
      }),
    );
    expect(movements.length).toBeGreaterThan(0);
    expectBalancedMovements(movements);
    expect(
      movements.every((movement: any) => movement.businessId === businessId),
    ).toBe(true);
    expect(
      movements.every(
        (movement: any) =>
          movement.originType === AccountingMovementOriginType.PAYROLL_RUN,
      ),
    ).toBe(true);
    expect(
      movements.every((movement: any) => movement.originId === 'run-1'),
    ).toBe(true);
    expect(
      movements.every((movement: any) =>
        mappingCodes.has(accountCodeFromMovement(movement)!),
      ),
    ).toBe(true);
    expect(
      movements.every((movement: any) =>
        Boolean(accountCodeFromMovement(movement)),
      ),
    ).toBe(true);
    expect(
      movements.some(
        (movement: any) => accountCodeFromMovement(movement) === '510506',
      ),
    ).toBe(true);
    expect(
      movements.some(
        (movement: any) => accountCodeFromMovement(movement) === '237005',
      ),
    ).toBe(true);
    expect(prisma.accountingMovement.deleteMany).toHaveBeenCalledWith({
      where: {
        businessId,
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
    });
  });

  it('recalculates existing editable payroll runs instead of keeping stale benefit formulas', async () => {
    const prisma = createPrismaMock();
    const period = enabledPeriodicPayrollPeriod(
      PayrollPeriodStatus.CALCULATED,
    );
    const employee = defaultEmployee();
    const contract = {
      ...defaultContract(),
      salaryMonthly: new Prisma.Decimal(4_000_000),
      isRemote: false,
    };

    prisma.payrollPeriod.findFirst.mockResolvedValue(period);
    prisma.payrollPeriod.findUnique.mockResolvedValue(period);
    prisma.employee.findMany.mockResolvedValue([employee]);
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employeeContract.findFirst.mockResolvedValue(contract);
    prisma.payrollRun.findFirst.mockResolvedValue({
      id: 'existing-run',
      businessId,
      payrollPeriodId: periodId,
      employeeId,
      contractId,
      severance: new Prisma.Decimal(333_200),
      serviceBonus: new Prisma.Decimal(333_200),
      vacation: new Prisma.Decimal(166_800),
    });
    prisma.payrollRun.upsert.mockImplementation(({ update }: any) =>
      Promise.resolve({ id: 'existing-run', ...update }),
    );
    prisma.payrollRun.findUnique.mockImplementation(() =>
      Promise.resolve({
        id: 'existing-run',
        employee,
        contract,
        adjustments: [],
        conceptResults: [],
        payments: [],
        serviceBonus: new Prisma.Decimal(333_333),
        usedParameters: {},
      }),
    );
    const service = new PayrollService(prisma as any);

    const result = await service.calculatePeriodPayroll(businessId, periodId);

    expect(result.calculatedRuns).toBe(1);
    expect(prisma.payrollRun.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = prisma.payrollRun.upsert.mock.calls[0][0];
    expect(Number(upsertArgs.update.severance)).toBe(333_200);
    expect(Number(upsertArgs.update.severanceInterest)).toBe(39_984);
    expect(Number(upsertArgs.update.serviceBonus)).toBe(333_200);
    expect(Number(upsertArgs.update.vacation)).toBe(166_800);
    expect(Number(upsertArgs.update.totalBenefits)).toBe(873_184);
  });

  it('liquidates a contract and creates balanced accounting movements with seed mappings', async () => {
    const prisma = createPrismaMock();
    const contract = defaultContract();
    const mappings = seedPayrollAccountingMappingsFixture();
    const mappingCodes = new Set(
      mappings.map((mapping) => mapping.accountCode),
    );
    let settlementLines: any[] = [];
    let settlementRecord: any;

    prisma.employeeContract.findFirst.mockResolvedValue(contract);
    prisma.payrollContractSettlement.findFirst.mockResolvedValue(null);
    prisma.payrollContractSettlement.create.mockImplementation(({ data }: any) => {
      settlementRecord = { id: 'settlement-1', ...data };
      return Promise.resolve(settlementRecord);
    });
    prisma.payrollContractSettlementLine.createMany.mockImplementation(
      ({ data }: any) => {
        settlementLines = data;
        return Promise.resolve({ count: data.length });
      },
    );
    prisma.payrollContractSettlement.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...settlementRecord,
        businessId,
        employeeId,
        contractId,
        type: PayrollSettlementType.REAL_TERMINATION,
        status: PayrollSettlementStatus.CALCULATED,
        employee: defaultEmployee(),
        contract,
        lines: settlementLines,
      }),
    );
    prisma.payrollContractSettlement.update.mockImplementation(
      ({ data }: any) =>
        Promise.resolve({
        ...settlementRecord,
          businessId,
          employeeId,
          contractId,
          type: PayrollSettlementType.REAL_TERMINATION,
          status: data.status,
          postedAt: data.postedAt,
          employee: defaultEmployee(),
          contract,
          lines: settlementLines,
        }),
    );
    prisma.payrollAccountingMapping.findMany.mockImplementation((args: any) => {
      const codes = args.where.conceptCode.in as string[];
      return Promise.resolve(
        mappings.filter((mapping) => codes.includes(mapping.conceptCode)),
      );
    });
    const service = new PayrollService(prisma as any);

    const preview: any = await service.simulateContractSettlement(
      businessId,
      contractId,
      { endDate: '2026-12-31', calculationYear: 2026 },
    );

    const result: any = await service.createContractSettlement(
      businessId,
      contractId,
      {
        endDate: '2026-12-31',
        calculationYear: 2026,
      },
    );

    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(result.status).toBe(PayrollSettlementStatus.POSTED);
    expect(Number(result.severanceInterest)).toBe(
      Number(preview.severanceInterest),
    );
    expect(Number(result.serviceBonusSemesterOne)).toBe(
      Number(preview.serviceBonusSemesterOne),
    );
    expect(Number(result.totalAmount)).toBe(Number(preview.totalAmount));
    expect(prisma.payrollAccountingMapping.upsert).toHaveBeenCalled();
    expect(prisma.employeeContract.update).toHaveBeenCalledWith({
      where: { id: contractId },
      data: { endDate: new Date('2026-12-31T00:00:00.000Z'), isActive: false },
    });
    expect(movements.length).toBeGreaterThan(0);
    expectBalancedMovements(movements);
    expect(
      movements.every((movement: any) => movement.businessId === businessId),
    ).toBe(true);
    expect(
      movements.every(
        (movement: any) =>
          movement.originType ===
          AccountingMovementOriginType.PAYROLL_SETTLEMENT,
      ),
    ).toBe(true);
    expect(
      movements.every((movement: any) => movement.originId === 'settlement-1'),
    ).toBe(true);
    expect(
      movements.every((movement: any) =>
        mappingCodes.has(accountCodeFromMovement(movement)!),
      ),
    ).toBe(true);
    expect(
      movements.every((movement: any) =>
        Boolean(accountCodeFromMovement(movement)),
      ),
    ).toBe(true);
    expect(
      movements.some(
        (movement: any) => accountCodeFromMovement(movement) === '510530',
      ),
    ).toBe(true);
    expect(
      movements.some(
        (movement: any) => accountCodeFromMovement(movement) === '251010',
      ),
    ).toBe(true);
  });

  it('fails monthly payroll liquidation clearly when an accounting mapping is missing', async () => {
    const prisma = createPrismaMock();
    const period = enabledPeriodicPayrollPeriod();
    const employee = defaultEmployee();
    const contract = defaultContract();
    const mappings = seedPayrollAccountingMappingsFixture().filter(
      (mapping) => mapping.conceptCode !== 'NET_PAY',
    );
    let runRecord: any;
    let conceptResults: any[] = [];

    prisma.payrollPeriod.findFirst.mockResolvedValue(period);
    prisma.payrollPeriod.findUnique.mockResolvedValue(period);
    prisma.employee.findMany.mockResolvedValue([employee]);
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employeeContract.findFirst.mockResolvedValue(contract);
    prisma.payrollAccountingMapping.findMany.mockImplementation((args: any) => {
      const codes = args.where.conceptCode.in as string[];
      return Promise.resolve(
        mappings.filter((mapping) => codes.includes(mapping.conceptCode)),
      );
    });
    prisma.payrollRun.upsert.mockImplementation(({ create }: any) => {
      runRecord = { id: 'run-1', ...create, employee, contract };
      return Promise.resolve(runRecord);
    });
    prisma.payrollConceptResult.createMany.mockImplementation(
      ({ data }: any) => {
        conceptResults = data;
        return Promise.resolve({ count: data.length });
      },
    );
    prisma.payrollRun.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...runRecord,
        employee,
        contract,
        adjustments: [],
        conceptResults,
        payments: [],
      }),
    );
    prisma.payrollRun.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          ...runRecord,
          employee,
          contract,
          adjustments: [],
          conceptResults,
          payments: [],
        },
      ]),
    );
    prisma.payrollPeriod.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...period, ...data }),
    );
    const service = new PayrollService(prisma as any);

    await expect(
      service.liquidatePeriodPayroll(businessId, periodId),
    ).rejects.toThrow(/NET_PAY/);
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    expect(prisma.payrollPeriod.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayrollPeriodStatus.POSTED }),
      }),
    );
  });

  it('balances a one-peso payroll accounting rounding difference by increasing NET_PAY credit', () => {
    const service = new PayrollService(createPrismaMock() as any);
    const movements: Prisma.AccountingMovementCreateManyInput[] = [
      {
        businessId,
        amount: new Prisma.Decimal(3_157_799),
        nature: MovementNature.DEBIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Devengados',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
      {
        businessId,
        amount: new Prisma.Decimal(3_157_798),
        nature: MovementNature.CREDIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Neto a pagar',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
    ];

    const result = (service as any).balanceAccountingMovementsForRounding(
      movements,
      'NET_PAY',
    );

    expectBalancedMovements(result.movements);
    expect(result.roundingAdjustment.toString()).toBe('1');
    expect(result.roundingAdjustmentTarget).toBe('NET_PAY');
    expect(result.movements[1].amount.toString()).toBe('3157799');
    expect(result.movements[1].detail).toContain('Ajuste redondeo contable 1');
    expect(
      result.movements.every(
        (movement: any) =>
          movement.originType === AccountingMovementOriginType.PAYROLL_RUN,
      ),
    ).toBe(true);
    expect(
      result.movements.every((movement: any) => movement.originId === 'run-1'),
    ).toBe(true);
  });

  it('balances an inverse one-peso payroll accounting rounding difference by reducing NET_PAY credit', () => {
    const service = new PayrollService(createPrismaMock() as any);
    const movements: Prisma.AccountingMovementCreateManyInput[] = [
      {
        businessId,
        amount: new Prisma.Decimal(3_157_798),
        nature: MovementNature.DEBIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Devengados',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
      {
        businessId,
        amount: new Prisma.Decimal(3_157_799),
        nature: MovementNature.CREDIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Neto a pagar',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
    ];

    const result = (service as any).balanceAccountingMovementsForRounding(
      movements,
      'NET_PAY',
    );

    expectBalancedMovements(result.movements);
    expect(result.roundingAdjustment.toString()).toBe('-1');
    expect(result.roundingAdjustmentTarget).toBe('NET_PAY');
    expect(result.movements[1].amount.toString()).toBe('3157798');
    expect(result.movements[1].detail).toContain('Ajuste redondeo contable -1');
  });

  it('does not hide payroll accounting imbalances larger than one peso', () => {
    const service = new PayrollService(createPrismaMock() as any);
    const movements: Prisma.AccountingMovementCreateManyInput[] = [
      {
        businessId,
        amount: new Prisma.Decimal(3_157_799),
        nature: MovementNature.DEBIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Devengados',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
      {
        businessId,
        amount: new Prisma.Decimal(3_157_699),
        nature: MovementNature.CREDIT,
        date: new Date(),
        detail: 'Nomina 2026-08 Ana Gomez - Neto a pagar',
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: 'run-1',
      },
    ];

    const result = (service as any).balanceAccountingMovementsForRounding(
      movements,
      'NET_PAY',
    );

    expect(result.roundingAdjustment.toString()).toBe('100');
    expect(result.totals.debit.equals(result.totals.credit)).toBe(false);
    expect(result.movements[1].amount.toString()).toBe('3157699');
  });
});

describe('PayrollService complementary payroll runs', () => {
  function setupComplementaryPayroll(
    status: PayrollPeriodStatus = PayrollPeriodStatus.POSTED,
  ) {
    const prisma = createPrismaMock();
    const period = enabledPeriodicPayrollPeriod(status);
    const employee = defaultEmployee();
    const contract = defaultContract();
    const mappings = seedPayrollAccountingMappingsFixture();
    let runRecord: any;
    let conceptResults: any[] = [];
    let findUniqueCalls = 0;

    prisma.payrollPeriod.findFirst.mockResolvedValue(period);
    prisma.payrollPeriod.findUnique.mockResolvedValue(period);
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employeeContract.findFirst.mockResolvedValue(contract);
    prisma.payrollRun.findUnique.mockImplementation(() => {
      findUniqueCalls += 1;
      if (findUniqueCalls <= 2) return Promise.resolve(null);
      return Promise.resolve({
        ...runRecord,
        employee,
        contract,
        adjustments: [],
        conceptResults,
        payments: [],
      });
    });
    prisma.payrollAccountingMapping.findMany.mockImplementation((args: any) => {
      const codes = args.where.conceptCode.in as string[];
      return Promise.resolve(
        mappings.filter((mapping) => codes.includes(mapping.conceptCode)),
      );
    });
    prisma.payrollRun.create.mockImplementation(({ data }: any) => {
      runRecord = {
        id: 'run-complementary-1',
        ...data,
        employee,
        contract,
      };
      return Promise.resolve(runRecord);
    });
    prisma.payrollConceptResult.createMany.mockImplementation(
      ({ data }: any) => {
        conceptResults = data;
        return Promise.resolve({ count: data.length });
      },
    );

    return { prisma };
  }

  it('creates a complementary run and independent balanced accounting for posted period', async () => {
    const { prisma } = setupComplementaryPayroll();
    const service = new PayrollService(prisma as any);

    const result = await service.createComplementaryPayrollRun(
      businessId,
      periodId,
      employeeId,
      { reason: 'Empleado cargado después de liquidar período' },
    );

    expect(result.id).toBe('run-complementary-1');
    expect(prisma.payrollRun.create).toHaveBeenCalledTimes(1);
    expect(prisma.payrollRun.upsert).not.toHaveBeenCalled();
    expect(prisma.payrollPeriod.update).not.toHaveBeenCalled();
    const createArgs = prisma.payrollRun.create.mock.calls[0][0].data;
    expect(createArgs.usedParameters.isComplementary).toBe(true);
    expect(createArgs.usedParameters.complementaryReason).toBe(
      'Empleado cargado después de liquidar período',
    );

    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(movements.length).toBeGreaterThan(0);
    expectBalancedMovements(movements);
    expect(
      movements.every(
        (movement: any) => movement.originType === 'PAYROLL_COMPLEMENTARY_RUN',
      ),
    ).toBe(true);
    expect(
      movements.every(
        (movement: any) => movement.originId === 'run-complementary-1',
      ),
    ).toBe(true);
    expect(
      movements.every((movement: any) =>
        movement.detail.includes('Nómina 2026-08'),
      ),
    ).toBe(true);
    expect(prisma.accountingMovement.deleteMany).not.toHaveBeenCalledWith({
      where: expect.objectContaining({
        originType: AccountingMovementOriginType.PAYROLL_RUN,
      }),
    });
  });

  it('blocks complementary run when employee already has payroll run in the period', async () => {
    const { prisma } = setupComplementaryPayroll();
    prisma.payrollRun.findUnique.mockResolvedValueOnce({ id: 'existing-run' });
    const service = new PayrollService(prisma as any);

    await expect(
      service.createComplementaryPayrollRun(
        businessId,
        periodId,
        employeeId,
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.payrollRun.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('blocks complementary run for non-posted period', async () => {
    const { prisma } = setupComplementaryPayroll(PayrollPeriodStatus.OPEN);
    const service = new PayrollService(prisma as any);

    await expect(
      service.createComplementaryPayrollRun(
        businessId,
        periodId,
        employeeId,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payrollRun.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('blocks complementary run when employee has no active contract for the period', async () => {
    const { prisma } = setupComplementaryPayroll();
    prisma.employeeContract.findFirst.mockResolvedValue(null);
    const service = new PayrollService(prisma as any);

    await expect(
      service.createComplementaryPayrollRun(
        businessId,
        periodId,
        employeeId,
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payrollRun.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });
});

describe('PayrollService benefit payments', () => {
  function benefitPaymentMappings(paymentConcept = 'PAYROLL_PAYMENT_BANK') {
    return [
      {
        conceptCode: 'SERVICE_BONUS',
        accountCode: '510536',
        side: PayrollAccountingSide.DEBIT,
        isActive: true,
      },
      {
        conceptCode: 'SERVICE_BONUS_SEMESTER_ONE',
        accountCode: '2520',
        side: PayrollAccountingSide.CREDIT,
        isActive: true,
      },
      {
        conceptCode: paymentConcept,
        accountCode:
          paymentConcept === 'PAYROLL_PAYMENT_CASH' ? '110505' : '111005',
        side: PayrollAccountingSide.CREDIT,
        isActive: true,
      },
    ];
  }

  it('creates a benefit payment and generates balanced accounting movements', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(50000),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 50000 }]);

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 50000,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    } as any);

    expect(prisma.accountingMovement.createMany).toHaveBeenCalled();
    const callArgs = prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(callArgs.length).toBe(2);
    expect(callArgs[0].nature).toBe(MovementNature.DEBIT);
    expect(callArgs[0].pucCuentaCode).toBe('2520');
    expect(callArgs[1].nature).toBe(MovementNature.CREDIT);
    expect(callArgs[1].pucSubcuentaId).toBe('111005');
    expect(callArgs).not.toContainEqual(
      expect.objectContaining({ pucSubcuentaId: '510536' }),
    );
    expect(
      callArgs.every(
        (movement: any) =>
          movement.originType ===
          AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
      ),
    ).toBe(true);
  });

  it('creates a cash benefit payment against cash subaccount', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings('PAYROLL_PAYMENT_CASH'),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(50000),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 50000 }]);

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 50000,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.CASH,
    } as any);

    expect(prisma.accountingMovement.createMany).toHaveBeenCalled();
    const callArgs = prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(callArgs.length).toBe(2);
    expect(callArgs[0].nature).toBe(MovementNature.DEBIT);
    expect(callArgs[0].pucCuentaCode).toBe('2520');
    expect(callArgs[1].nature).toBe(MovementNature.CREDIT);
    expect(callArgs[1].pucSubcuentaId).toBe('110505');
    expect(callArgs).not.toContainEqual(
      expect.objectContaining({ pucSubcuentaId: '510536' }),
    );
  });

  it('auto-regularizes small service bonus rounding differences within tolerance', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(1000000),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 999600 }]);

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 1000000,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    } as any);

    expect(prisma.payrollBenefitPayment.create).toHaveBeenCalledTimes(1);
    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(movements.length).toBe(4);
    expectBalancedMovements(movements.slice(0, 2));
    expectBalancedMovements(movements.slice(2, 4));
    expect(movements[0]).toMatchObject({
      pucSubcuentaId: '510536',
      nature: MovementNature.DEBIT,
      originType: 'PAYROLL_INITIAL_BALANCE',
      originId: 'ROUNDING_BENEFIT_REGULARIZATION:contract-1:PRIMA:2026:1',
    });
    expect(new Prisma.Decimal(movements[0].amount).toFixed(0)).toBe('400');
    expect(movements[1]).toMatchObject({
      pucCuentaCode: '2520',
      nature: MovementNature.CREDIT,
      originType: 'PAYROLL_INITIAL_BALANCE',
      originId: 'ROUNDING_BENEFIT_REGULARIZATION:contract-1:PRIMA:2026:1',
    });
    expect(new Prisma.Decimal(movements[1].amount).toFixed(0)).toBe('400');
    expect(movements[0].detail).toContain('"type":"ROUNDING_REGULARIZATION"');
    expect(movements[0].detail).toContain('"tolerance":"1000"');
    expect(movements[2]).toMatchObject({
      pucCuentaCode: '2520',
      nature: MovementNature.DEBIT,
      originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
    });
    expect(new Prisma.Decimal(movements[2].amount).toFixed(0)).toBe('1000000');
    expect(movements[3]).toMatchObject({
      pucSubcuentaId: '111005',
      nature: MovementNature.CREDIT,
      originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
    });
    expect(new Prisma.Decimal(movements[3].amount).toFixed(0)).toBe('1000000');
  });

  it('does not duplicate service bonus rounding regularization if it already exists', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(1000000),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 999600 }]);
    prisma.accountingMovement.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-rounding' });

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 1000000,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    } as any);

    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(movements.length).toBe(2);
    expect(
      movements.every(
        (movement: any) =>
          movement.originType ===
          AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
      ),
    ).toBe(true);
    expect(
      movements.some(
        (movement: any) =>
          movement.originId ===
          'ROUNDING_BENEFIT_REGULARIZATION:contract-1:PRIMA:2026:1',
      ),
    ).toBe(false);
  });

  it('returns structured regularization requirement when provision is insufficient', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 499800 }]);

    const service = new PayrollService(prisma as any);

    await expect(
      service.createContractBenefitPayment('biz-1', 'contract-1', {
        type: 'PRIMA',
        amount: 983333,
        year: 2026,
        semester: 1,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_PROVISION_REQUIRES_REGULARIZATION',
        requiredAmount: '983333',
        provisionedAmount: '499800',
        missingAmount: '483533',
        benefitType: 'PRIMA',
        year: 2026,
        semester: 1,
      }),
    });
    expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('regularizes missing provision and pays service bonus in one accounting batch', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(983333),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 499800 }]);

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 983333,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      regularizeMissingProvision: true,
    } as any);

    expect(prisma.payrollBenefitPayment.create).toHaveBeenCalledTimes(1);
    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(movements.length).toBe(4);
    expectBalancedMovements(movements.slice(0, 2));
    expectBalancedMovements(movements.slice(2, 4));
    expect(movements[0]).toMatchObject({
      pucSubcuentaId: '510536',
      nature: MovementNature.DEBIT,
      originType: 'PAYROLL_INITIAL_BALANCE',
    });
    expect(new Prisma.Decimal(movements[0].amount).toFixed(0)).toBe('483533');
    expect(movements[1]).toMatchObject({
      pucCuentaCode: '2520',
      nature: MovementNature.CREDIT,
      originType: 'PAYROLL_INITIAL_BALANCE',
    });
    expect(new Prisma.Decimal(movements[1].amount).toFixed(0)).toBe('483533');
    expect(movements[2]).toMatchObject({
      pucCuentaCode: '2520',
      nature: MovementNature.DEBIT,
      originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
    });
    expect(new Prisma.Decimal(movements[2].amount).toFixed(0)).toBe('983333');
    expect(movements[3]).toMatchObject({
      pucSubcuentaId: '111005',
      nature: MovementNature.CREDIT,
      originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
    });
    expect(new Prisma.Decimal(movements[3].amount).toFixed(0)).toBe('983333');
    expect(movements[0].originId).toBe(
      'INITIAL_BENEFIT_REGULARIZATION:contract-1:PRIMA:2026:1',
    );
    expect(movements[0].detail).toContain(
      '"reason":"INSUFFICIENT_HISTORICAL_PAYROLL_RUNS"',
    );
  });

  it('handles benefit payment creation idempotently if already paid, not throwing 409, not duplicating, and recreating missing movements', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );

    const existingPayment = {
      id: 'payment-1',
      status: 'PAID' as any,
      amount: new Prisma.Decimal(50000),
    };
    prisma.payrollBenefitPayment.findFirst = jest
      .fn()
      .mockResolvedValue(existingPayment);
    // Pretend 1 of the 2 movements is already in the DB, so only 1 is missing and should be recreated
    prisma.accountingMovement.findMany = jest.fn().mockResolvedValue([
      {
        id: 'mv-1',
        businessId: 'biz-1',
        pucCuentaCode: '2520',
        amount: new Prisma.Decimal(50000),
        nature: MovementNature.DEBIT,
        originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
        originId: 'payment-1',
      },
    ]);

    const service = new PayrollService(prisma as any);

    const result = await service.createContractBenefitPayment(
      'biz-1',
      'contract-1',
      {
        type: 'PRIMA',
        amount: 50000,
        year: 2026,
        semester: 1,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
      } as any,
    );

    expect(result).toEqual(existingPayment);
    expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).toHaveBeenCalledTimes(1);

    // Check that only the credit movement (111005) was recreated since debit (2520) was already in DB
    const callArgs = prisma.accountingMovement.createMany.mock.calls[0][0].data;
    expect(callArgs.length).toBe(1);
    expect(callArgs[0].nature).toBe(MovementNature.CREDIT);
    expect(callArgs[0].pucSubcuentaId).toBe('111005');
  });

  it('does not duplicate service bonus initial regularization if it already exists (improved contractId/employeeId check)', async () => {
    const prisma = createPrismaMock();
    const contract = {
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    };
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue(contract);
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollBenefitPayment.create = jest
      .fn()
      .mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(983333),
      });
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 499800 }]);

    // Mock existing regularization in the DB matching either contractId or employeeId
    prisma.accountingMovement.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'existing-regularization' });

    const service = new PayrollService(prisma as any);

    await service.createContractBenefitPayment('biz-1', 'contract-1', {
      type: 'PRIMA',
      amount: 983333,
      year: 2026,
      semester: 1,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      regularizeMissingProvision: true,
    } as any);

    expect(prisma.payrollBenefitPayment.create).toHaveBeenCalledTimes(1);
    const movements =
      prisma.accountingMovement.createMany.mock.calls[0][0].data;
    // Should contain only the 2 benefit payment movements, and 0 regularization movements because it already exists!
    expect(movements.length).toBe(2);
    expect(
      movements.every(
        (m: any) =>
          m.originType === AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
      ),
    ).toBe(true);
  });

  it('handles second call with regularizeMissingProvision true idempotently, not duplicating payment nor movements', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue(
      benefitPaymentMappings(),
    );

    const existingPayment = {
      id: 'payment-1',
      status: 'PAID' as any,
      amount: new Prisma.Decimal(983333),
    };
    prisma.payrollBenefitPayment.findFirst = jest
      .fn()
      .mockResolvedValue(existingPayment);
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 499800 }]);

    // Both regularization and rounding adjustments already exist in DB
    prisma.accountingMovement.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'existing-regularization' });
    prisma.accountingMovement.findMany = jest.fn().mockResolvedValue([
      {
        id: 'mv-1',
        businessId: 'biz-1',
        pucCuentaCode: '2520',
        amount: new Prisma.Decimal(983333),
        nature: MovementNature.DEBIT,
        originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
        originId: 'payment-1',
      },
      {
        id: 'mv-2',
        businessId: 'biz-1',
        pucSubcuentaId: '111005',
        amount: new Prisma.Decimal(983333),
        nature: MovementNature.CREDIT,
        originType: AccountingMovementOriginType.PAYROLL_BENEFIT_PAYMENT,
        originId: 'payment-1',
      },
    ]);

    const service = new PayrollService(prisma as any);

    const result = await service.createContractBenefitPayment(
      'biz-1',
      'contract-1',
      {
        type: 'PRIMA',
        amount: 983333,
        year: 2026,
        semester: 1,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        regularizeMissingProvision: true,
      } as any,
    );

    expect(result).toEqual(existingPayment);
    expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  it('does not create benefit payment when an accounting mapping is missing', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
      id: 'contract-1',
      employeeId: 'emp-1',
      employee: { firstName: 'Juan', lastName: 'Perez' },
    });
    prisma.payrollAccountingMapping.findMany.mockResolvedValue([
      {
        conceptCode: 'SERVICE_BONUS_SEMESTER_ONE',
        accountCode: '2520',
        side: PayrollAccountingSide.CREDIT,
        isActive: true,
      },
    ]);
    prisma.payrollBenefitPayment.findFirst = jest.fn().mockResolvedValue(null);
    prisma.payrollRun.findMany.mockResolvedValue([{ serviceBonus: 50000 }]);

    const service = new PayrollService(prisma as any);

    await expect(
      service.createContractBenefitPayment('biz-1', 'contract-1', {
        type: 'PRIMA',
        amount: 50000,
        year: 2026,
        semester: 1,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
    expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
  });

  describe('Regularization and Payment Validation Scenarios (Caso A, B, C)', () => {
    it('Caso A: provision = 0, amount = 2000000, regularizeMissingProvision absent -> rejects with ConflictException and creates nothing', async () => {
      const prisma = createPrismaMock();
      prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
        id: 'contract-1',
        employeeId: 'emp-1',
        employee: { firstName: 'Juan', lastName: 'Perez' },
      });
      prisma.payrollAccountingMapping.findMany.mockResolvedValue(
        benefitPaymentMappings(),
      );
      prisma.payrollBenefitPayment.findFirst = jest
        .fn()
        .mockResolvedValue(null);
      prisma.payrollRun.findMany.mockResolvedValue([]); // Provision = 0
      prisma.accountingMovement.findFirst = jest.fn().mockResolvedValue(null);

      const service = new PayrollService(prisma as any);

      await expect(
        service.createContractBenefitPayment('biz-1', 'contract-1', {
          type: 'PRIMA',
          amount: 2000000,
          year: 2026,
          semester: 1,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
        } as any),
      ).rejects.toThrow(ConflictException);

      expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
      expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    });

    it('Caso B: provision = 0, amount = 2000000, regularizeMissingProvision = true -> creates regularization, payment and movements without error', async () => {
      const prisma = createPrismaMock();
      prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
        id: 'contract-1',
        employeeId: 'emp-1',
        employee: { firstName: 'Juan', lastName: 'Perez' },
      });
      prisma.payrollAccountingMapping.findMany.mockResolvedValue(
        benefitPaymentMappings(),
      );
      prisma.payrollBenefitPayment.findFirst = jest
        .fn()
        .mockResolvedValue(null);
      prisma.payrollRun.findMany.mockResolvedValue([]); // Provision = 0
      prisma.accountingMovement.findFirst = jest.fn().mockResolvedValue(null);
      prisma.payrollBenefitPayment.create = jest.fn().mockResolvedValue({
        id: 'payment-1',
        amount: new Prisma.Decimal(2000000),
        status: 'PAID',
        paidAt: new Date(),
      });

      const service = new PayrollService(prisma as any);

      const result = await service.createContractBenefitPayment(
        'biz-1',
        'contract-1',
        {
          type: 'PRIMA',
          amount: 2000000,
          year: 2026,
          semester: 1,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          regularizeMissingProvision: true,
        } as any,
      );

      expect(result.id).toBe('payment-1');
      expect(prisma.payrollBenefitPayment.create).toHaveBeenCalledTimes(1);
      expect(prisma.accountingMovement.createMany).toHaveBeenCalledTimes(1);
      const movements =
        prisma.accountingMovement.createMany.mock.calls[0][0].data;
      // 2 for initial regularization + 2 for payment = 4
      expect(movements.length).toBe(4);
    });

    it('Caso C: repeat Caso B -> returns existing payment, does not duplicate payment nor movements', async () => {
      const prisma = createPrismaMock();
      prisma.employeeContract.findFirst = jest.fn().mockResolvedValue({
        id: 'contract-1',
        employeeId: 'emp-1',
        employee: { firstName: 'Juan', lastName: 'Perez' },
      });
      prisma.payrollAccountingMapping.findMany.mockResolvedValue(
        benefitPaymentMappings(),
      );

      const existingPayment = {
        id: 'payment-1',
        amount: new Prisma.Decimal(2000000),
        status: 'PAID' as any,
        year: 2026,
        semester: 1,
      };
      prisma.payrollBenefitPayment.findFirst = jest
        .fn()
        .mockResolvedValue(existingPayment);
      prisma.payrollRun.findMany.mockResolvedValue([]); // Provision = 0
      prisma.accountingMovement.findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'existing-regularization' });
      prisma.accountingMovement.findMany = jest.fn().mockResolvedValue([
        {
          id: 'mv-1',
          originType: 'PAYROLL_INITIAL_BALANCE',
          originId: 'reg-1',
          amount: 2000000,
          nature: 'DEBIT',
          pucSubcuentaId: '510536',
        },
        {
          id: 'mv-2',
          originType: 'PAYROLL_INITIAL_BALANCE',
          originId: 'reg-1',
          amount: 2000000,
          nature: 'CREDIT',
          pucCuentaCode: '2520',
        },
        {
          id: 'mv-3',
          originType: 'PAYROLL_BENEFIT_PAYMENT',
          originId: 'payment-1',
          amount: 2000000,
          nature: 'DEBIT',
          pucCuentaCode: '2520',
        },
        {
          id: 'mv-4',
          originType: 'PAYROLL_BENEFIT_PAYMENT',
          originId: 'payment-1',
          amount: 2000000,
          nature: 'CREDIT',
          pucSubcuentaId: '111005',
        },
      ]);

      const service = new PayrollService(prisma as any);

      const result = await service.createContractBenefitPayment(
        'biz-1',
        'contract-1',
        {
          type: 'PRIMA',
          amount: 2000000,
          year: 2026,
          semester: 1,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          regularizeMissingProvision: true,
        } as any,
      );

      expect(result).toEqual(existingPayment);
      expect(prisma.payrollBenefitPayment.create).not.toHaveBeenCalled();
      expect(prisma.accountingMovement.createMany).not.toHaveBeenCalled();
    });
  });
});
