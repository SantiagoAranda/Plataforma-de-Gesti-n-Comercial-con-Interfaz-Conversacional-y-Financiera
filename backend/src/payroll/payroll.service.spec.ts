import { BadRequestException } from '@nestjs/common';
import { PayrollPeriodStatus } from '@prisma/client';
import { PayrollService } from './payroll.service';

function createPrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', businessId: 'biz-1' }),
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
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payrollContractSettlement: {
      count: jest.fn().mockResolvedValue(0),
    },
    payrollPayment: {
      count: jest.fn().mockResolvedValue(0),
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
      findFirst: jest.fn().mockResolvedValue({ smmlv: 1_300_000 }),
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
});
