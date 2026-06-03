import { BadRequestException } from '@nestjs/common';
import {
  PayrollContractType,
  PayrollPaymentCycle,
  PayrollPeriodStatus,
  Prisma,
} from '@prisma/client';
import { PayrollService } from './payroll.service';

function createPrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    employee: {
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
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    payrollContractSettlement: {
      count: jest.fn().mockResolvedValue(0),
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
        month: 5,
        paymentCycle: PayrollPaymentCycle.MONTHLY,
        status: PayrollPeriodStatus.OPEN,
      }),
    },
    payrollOvertimeRate: {
      findMany: jest.fn().mockResolvedValue([]),
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
      findFirst: jest.fn().mockResolvedValue({
        id: 'global-2026',
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
        severanceInterestRate: 0.01,
        serviceBonusRate: 0.0833,
        vacationRate: 0.0417,
        law1819ThresholdSmmlv: 10,
        transportLimitSmmlv: 2,
        withholdingStatus: 'DISABLED_FOR_FUTURE_UPDATE',
      }),
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
    },
    payrollBenefitPayment: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(base)),
  };

  return Object.assign(base, overrides);
}

describe('PayrollService payroll history rules', () => {
  it('blocks employee inactivation when an active contract exists', async () => {
    const prisma = createPrismaMock();
    prisma.employeeContract.findFirst.mockResolvedValue({ id: 'contract-1' });
    const service = new PayrollService(prisma as any);

    await expect(service.deleteEmployee('biz-1', 'emp-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('hard deletes an employee only when there is no payroll history', async () => {
    const prisma = createPrismaMock();
    const service = new PayrollService(prisma as any);

    await expect(service.hardDeleteEmployee('biz-1', 'emp-1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.employee.delete).toHaveBeenCalledWith({ where: { id: 'emp-1' } });
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
      service.updateContract('biz-1', 'contract-1', { salaryMonthly: 3_500_000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employeeContract.update).not.toHaveBeenCalled();
  });

  it('matches Dataico base payroll reference for salary 1.750.905', async () => {
    const prisma = createPrismaMock();
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
    expect(Number(result.vacation)).toBe(73_013);
    expect(Math.round(Number(result.totalBenefits))).toBe(426_205);
    expect(Math.round(Number(result.realEmployerCost))).toBe(2_715_489);
  });

  it('matches Dataico monthly reference for salary 3.000.000 with employer health enabled', async () => {
    const prisma = createPrismaMock();
    prisma.payrollBusinessParameter.findUnique.mockResolvedValue({
      applyLaw1819: true,
      exemptEmployerHealthLaw1819: false,
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
    expect(result.usedParameters.law1819Applied).toBe(true);
    expect(result.usedParameters.exemptEmployerHealthLaw1819).toBe(false);
    expect(result.usedParameters.benefitProfile).toBe('DATAICO_TRUNCATED');
    expect(result.usedParameters.severanceRateApplied).toBe('0.0833');
    expect(result.usedParameters.serviceBonusRateApplied).toBe('0.0833');
    expect(result.usedParameters.vacationRateApplied).toBe('0.0417');
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_12_PERCENT',
    );
  });

  it('uses official real employer cost with Law 1819 employer health exemption', async () => {
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
    expect(result.usedParameters.benefitProfile).toBe('DATAICO_TRUNCATED');
    expect(result.usedParameters.severanceRateApplied).toBe('0.0833');
    expect(result.usedParameters.serviceBonusRateApplied).toBe('0.0833');
    expect(result.usedParameters.vacationRateApplied).toBe('0.0417');
    expect(result.usedParameters.severanceInterestFormula).toBe(
      'MONTHLY_SEVERANCE_X_12_PERCENT',
    );
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
      'MONTHLY_SEVERANCE_X_12_PERCENT',
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

    expect(result.effectiveStartDate.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(result.effectiveEndDate.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(result.requestedEndDate.toISOString()).toBe('2027-02-04T00:00:00.000Z');
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
    expect(result.usedParameters.effectiveStartDate).toBe('2026-06-02T00:00:00.000Z');
    expect(result.usedParameters.effectiveEndDate).toBe('2026-06-30T00:00:00.000Z');
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

    expect(result.requestedEndDate.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(result.effectiveStartDate.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(result.effectiveEndDate.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(result.settlementScope).toBe('CURRENT_YEAR');
    expect(result.semester1Days).toBe(28);
    expect(result.semester2Days).toBe(180);
    expect(result.causedDays).toBe(208);
    expect(Number(result.severance)).toBe(1_155_556);
    expect(Number(result.severanceInterest)).toBe(80_119);
    expect(Number(result.serviceBonusSemester1)).toBe(155_556);
    expect(Number(result.serviceBonusSemester2)).toBe(1_000_000);
    expect(Number(result.vacation)).toBe(505_817);
    expect(Number(result.totalAmount)).toBe(2_897_047);
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

    expect(result.requestedEndDate.toISOString()).toBe('2027-06-03T00:00:00.000Z');
    expect(result.effectiveStartDate.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(result.effectiveEndDate.toISOString()).toBe('2026-06-30T00:00:00.000Z');
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

    expect(result.cutoffStartDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(result.settlementDate.toISOString()).toBe('2027-03-06T00:00:00.000Z');
    expect(result.causedDays).toBe(66);
    expect(result.totalWorkedDays).toBe(66);
    expect(result.semesterOneDays).toBe(66);
    expect(result.semesterTwoDays).toBe(0);
    expect(result.semester1Days).toBe(66);
    expect(result.semester2Days).toBe(0);
    expect(Number(result.serviceBonus)).toBe(595_667);
    expect(Number(result.totalAmount)).toBe(1_479_440);
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

    expect(result.cutoffStartDate.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(result.settlementDate.toISOString()).toBe('2027-06-03T00:00:00.000Z');
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
    expect(Number(result.totalAmount)).toBe(3_469_655);
    expect(result.usedParameters.originalContractStartDate).toBe('2026-06-03T00:00:00.000Z');
    expect(result.usedParameters.cutoffStartDate).toBe('2027-01-01T00:00:00.000Z');
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
    expect(result.usedParameters.requestedEndDate).toBe('2026-06-01T00:00:00.000Z');
    expect(result.usedParameters.calculationEndDate).toBe('2026-06-01T00:00:00.000Z');
    expect(result.cutoffStartDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(result.settlementDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(result.causedDays).toBe(151);
    expect(result.totalWorkedDays).toBe(151);
    expect(result.semesterOneDays).toBe(151);
    expect(result.semesterTwoDays).toBe(0);
    expect(Number(result.severance)).toBe(1_362_815);
    expect(Number(result.severanceInterest)).toBe(68_595);
    expect(Number(result.serviceBonus)).toBe(1_362_815);
    expect(Number(result.serviceBonusTotal)).toBe(1_362_815);
    expect(Number(result.vacation)).toBe(629_167);
    expect(Number(result.benefitsTotal)).toBe(3_423_391);
    expect(Number(result.salaryPending)).toBe(0);
    expect(result.salaryPendingAvailable).toBe(false);
    expect(Number(result.settlementTotalPayable)).toBe(3_423_391);
    expect(Number(result.totalAmount)).toBe(3_423_391);
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

    expect(result.effectiveStartDate.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(result.effectiveEndDate.toISOString()).toBe('2026-08-15T00:00:00.000Z');
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
    expect(Number(result.benefitsTotal)).toBe(3_423_391);
    expect(Number(result.settlementTotalPayable)).toBe(3_423_391);
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
      expect(result.usedParameters.requestedEndDate).toBe('2026-06-02T00:00:00.000Z');
      expect(result.usedParameters.calculationEndDate).toBe('2026-06-02T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });
});
