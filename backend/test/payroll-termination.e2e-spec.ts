import {
  createBusinessFixture,
  verifyIsolatedTestEnvironment,
} from './business-fixtures';
import { PrismaClient } from '@prisma/client';
import { PayrollService } from './../src/payroll/payroll.service';
import { FeatureFlagsService } from './../src/common/config/feature-flags';

// Requires an isolated *_test database with payroll parameters, PUC and mappings seeded.
const prisma = new PrismaClient();
const enabled = {
  payrollContractTerminationEnabled: true,
} as FeatureFlagsService;

describe('Payroll employee termination (Integration)', () => {
  let service: PayrollService;
  const businessIds: string[] = [];

  async function newBusiness(label: string) {
    const business = await createBusinessFixture(prisma, {
      data: {
        name: `Termination ${label}`,
        slug: `termination-${label}-${Date.now()}`,
        fiscalId: '900123456',
        phoneWhatsapp: '3001234567',
        status: 'ACTIVE',
      },
    });
    businessIds.push(business.id);
    return business.id;
  }

  async function employeeWithContract(businessId: string, doc: string) {
    const employee = await service.createEmployee(businessId, {
      firstName: 'Ana',
      lastName: doc,
      documentNumber: doc,
    });
    const arl = await prisma.payrollArlRiskClass.findFirstOrThrow({
      where: { isActive: true },
    });
    const contract = await service.createContract(businessId, employee.id, {
      contractType: 'INDEFINITE',
      salaryMonthly: 2_000_000,
      // Before periodic payroll (Jul 2026): no final payroll run is required.
      startDate: '2026-01-01',
      paymentCycle: 'MONTHLY',
      arlRiskClassId: arl.id,
    });
    return { employee, contract };
  }

  beforeAll(async () => {
    await verifyIsolatedTestEnvironment();
    service = new PayrollService(prisma as any, enabled);
  });

  afterAll(async () => {
    for (const businessId of businessIds) {
      await prisma.accountingMovement.deleteMany({ where: { businessId } });
      await prisma.payrollContractSettlement.deleteMany({
        where: { businessId },
      });
      await prisma.employeeContract.deleteMany({ where: { businessId } });
      await prisma.employee.deleteMany({ where: { businessId } });
      await prisma.payrollAccountingMapping.deleteMany({
        where: { businessId },
      });
      await prisma.businessSlug.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  it('creates exactly one definitive settlement under concurrent requests and archives atomically', async () => {
    const businessId = await newBusiness('concurrency');
    const { employee, contract } = await employeeWithContract(
      businessId,
      'T-1',
    );
    const dto = {
      endDate: '2026-05-31',
      terminationReason: 'MUTUAL_AGREEMENT' as const,
    };

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.createContractSettlement(businessId, contract.id, dto),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    for (const rejected of results.filter((r) => r.status === 'rejected')) {
      expect(String((rejected as PromiseRejectedResult).reason)).toMatch(
        /already has a real settlement/,
      );
    }
    const settlements = await prisma.payrollContractSettlement.findMany({
      where: { businessId, contractId: contract.id },
    });
    expect(settlements).toHaveLength(1);
    expect(settlements[0].terminationReason).toBe('MUTUAL_AGREEMENT');
    const movementOrigins = await prisma.accountingMovement.groupBy({
      by: ['originId'],
      where: { businessId, originType: 'PAYROLL_SETTLEMENT' },
    });
    expect(movementOrigins).toEqual([{ originId: settlements[0].id }]);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } }))
        .isActive,
    ).toBe(false);
    expect(
      (
        await prisma.employeeContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).isActive,
    ).toBe(false);
  });

  it('rolls back the archive when the settlement cannot be posted', async () => {
    const businessId = await newBusiness('rollback');
    const { employee, contract } = await employeeWithContract(
      businessId,
      'T-2',
    );
    // Accounting runs after the archive inside the same transaction.
    const accounting = jest
      .spyOn(service as any, 'recreateSettlementAccountingMovements')
      .mockRejectedValueOnce(new Error('accounting failure'));

    await expect(
      service.createContractSettlement(businessId, contract.id, {
        endDate: '2026-04-30',
        terminationReason: 'CONTRACT_EXPIRATION',
      }),
    ).rejects.toThrow('accounting failure');
    accounting.mockRestore();

    expect(
      await prisma.payrollContractSettlement.count({ where: { businessId } }),
    ).toBe(0);
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } }))
        .isActive,
    ).toBe(true);
    expect(
      (
        await prisma.employeeContract.findUniqueOrThrow({
          where: { id: contract.id },
        })
      ).isActive,
    ).toBe(true);
  });

  it('deletes a mistaken record only without history and only inside its business', async () => {
    const businessId = await newBusiness('delete');
    const otherBusinessId = await newBusiness('other');
    const clean = await employeeWithContract(businessId, 'T-3');
    const withHistory = await employeeWithContract(businessId, 'T-4');
    await prisma.payrollEvent.create({
      data: {
        businessId,
        employeeId: withHistory.employee.id,
        employeeContractId: withHistory.contract.id,
        type: 'BONUS',
        unit: 'MONEY',
        quantity: 1,
        amountOverride: 10_000,
        startDate: new Date('2026-05-10T12:00:00Z'),
      },
    });

    await expect(
      service.deleteEmployeeRecord(otherBusinessId, clean.employee.id),
    ).rejects.toThrow('Employee not found');
    const check = await service.getEmployeeDeletionCheck(
      businessId,
      withHistory.employee.id,
    );
    expect(check.canDelete).toBe(false);
    await expect(
      service.deleteEmployeeRecord(businessId, withHistory.employee.id),
    ).rejects.toMatchObject({ response: { code: 'EMPLOYEE_HAS_HISTORY' } });
    expect(
      await prisma.payrollEvent.count({
        where: { employeeId: withHistory.employee.id },
      }),
    ).toBe(1);

    await expect(
      service.deleteEmployeeRecord(businessId, clean.employee.id),
    ).resolves.toEqual({ ok: true });
    expect(
      await prisma.employee.count({ where: { id: clean.employee.id } }),
    ).toBe(0);
    expect(
      await prisma.employeeContract.count({
        where: { employeeId: clean.employee.id },
      }),
    ).toBe(0);

    await prisma.payrollEvent.deleteMany({ where: { businessId } });
  });
});
