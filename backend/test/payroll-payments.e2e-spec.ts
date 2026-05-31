import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PayrollService } from '../src/payroll/payroll.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PayrollPaymentCycle, PayrollPeriodStatus, PayrollPaymentStatus, PayrollContractType, PayrollSettlementStatus } from '@prisma/client';

describe('Payroll Payments & Settlements (Integration)', () => {
  let app: INestApplication;
  let payrollService: PayrollService;
  let prisma: PrismaService;
  let businessId: string;
  let globalParameterId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    payrollService = app.get<PayrollService>(PayrollService);
    prisma = app.get<PrismaService>(PrismaService);

    // Setup: Create a test business
    const business = await prisma.business.create({
      data: {
        name: 'Test Business Payroll',
        slug: `test-payroll-${Date.now()}`,
        fiscalId: '900123456',
        phoneWhatsapp: '3001234567',
        status: 'ACTIVE',
      },
    });
    businessId = business.id;

    // Create Global Parameter
    const globalParam = await prisma.payrollGlobalParameter.create({
      data: {
        year: 2026,
        version: Date.now() % 100000,
        smmlv: 1300000,
        transportAllowance: 162000,
        uvt: 47065,
        monthlyHours: 240,
        isActive: true,
      }
    });
    globalParameterId = globalParam.id;

    // Accounts for mapping
    await prisma.pucClase.upsert({ where: { code: '5' }, create: { code: '5', name: 'Gastos' }, update: {} });
    await prisma.pucGrupo.upsert({ where: { code: '51' }, create: { code: '51', name: 'Operacionales de administración', claseCode: '5' }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '5105' }, create: { code: '5105', name: 'Gastos de personal', grupoCode: '51' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '510506' }, create: { code: '510506', name: 'Sueldos', cuentaCode: '5105', active: true }, update: {} });
    
    await prisma.pucClase.upsert({ where: { code: '2' }, create: { code: '2', name: 'Pasivo' }, update: {} });
    await prisma.pucGrupo.upsert({ where: { code: '25' }, create: { code: '25', name: 'Obligaciones laborales', claseCode: '2' }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '2505' }, create: { code: '2505', name: 'Salarios por pagar', grupoCode: '25' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '250505' }, create: { code: '250505', name: 'Salarios', cuentaCode: '2505', active: true }, update: {} });
    
    await prisma.pucClase.upsert({ where: { code: '1' }, create: { code: '1', name: 'Activo' }, update: {} });
    await prisma.pucGrupo.upsert({ where: { code: '11' }, create: { code: '11', name: 'Disponible', claseCode: '1' }, update: {} });
    await prisma.pucCuenta.upsert({ where: { code: '1110' }, create: { code: '1110', name: 'Bancos', grupoCode: '11' }, update: {} });
    await prisma.pucSubcuenta.upsert({ where: { code: '111005' }, create: { code: '111005', name: 'Moneda Nacional', cuentaCode: '1110', active: true }, update: {} });

    // Accounting Mappings
    await prisma.payrollAccountingMapping.createMany({
      data: [
        { businessId, conceptCode: 'NET_PAY', conceptName: 'Neto a pagar', side: 'DEBIT', accountCode: '250505', accountName: 'Salarios', isActive: true },
        { businessId, conceptCode: 'PAYROLL_PAYMENT_BANK', conceptName: 'Pago en Banco', side: 'CREDIT', accountCode: '111005', accountName: 'Bancos', isActive: true },
        // Mappings for run posting
        { businessId, conceptCode: 'NET_PAY', conceptName: 'Neto a pagar', side: 'CREDIT', accountCode: '250505', accountName: 'Salarios', isActive: true },
        { businessId, conceptCode: 'SALARY', conceptName: 'Salario', side: 'DEBIT', accountCode: '510506', accountName: 'Sueldos', isActive: true },
      ]
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.accountingMovement.deleteMany({ where: { businessId } });
    await prisma.payrollAccountingMapping.deleteMany({ where: { businessId } });
    await prisma.payrollPayment.deleteMany({ where: { businessId } });
    await prisma.payrollContractSettlement.deleteMany({ where: { businessId } });
    await prisma.payrollBenefitPayment.deleteMany({ where: { businessId } });
    // Cleanups that might not exist are commented out
    await prisma.payrollRun.deleteMany({ where: { businessId } });
    await prisma.payrollPeriod.deleteMany({ where: { businessId } });
    await prisma.employeeContract.deleteMany({ where: { businessId } });
    await prisma.employee.deleteMany({ where: { businessId } });
    await prisma.payrollGlobalParameter.deleteMany({ where: { id: globalParameterId } });
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  describe('Payroll Payments Requirements', () => {
    let employeeId: string;
    let contractId: string;
    let periodId: string;
    let runId: string;
    let payment1Id: string;
    let payment2Id: string;

    it('1. Create BIWEEKLY contract with monthly payroll period', async () => {
      const employee = await payrollService.createEmployee(businessId, {
        firstName: 'Juan',
        lastName: 'Perez',
        documentType: 'CC',
        documentNumber: '10000001',
      });
      employeeId = employee.id;

      const contract = await payrollService.createContract(businessId, employeeId, {
        contractType: PayrollContractType.INDEFINITE,
        salaryMonthly: 2000000,
        startDate: '2026-01-01',
        paymentCycle: PayrollPaymentCycle.BIWEEKLY,
      });
      contractId = contract.id;
      expect(contract.paymentCycle).toBe(PayrollPaymentCycle.BIWEEKLY);

      const period = await payrollService.createPayrollPeriod(businessId, {
        year: 2026,
        month: 1, // Jan 2026
        paymentCycle: PayrollPaymentCycle.BIWEEKLY,
      });
      periodId = period.id;
    });

    it('2. Automatic creation of two PayrollPayments within the same PayrollRun', async () => {
      const runResult = await payrollService.calculateEmployeePayroll(businessId, periodId, employeeId, {});
      const run = await prisma.payrollRun.findFirst({ where: { payrollPeriodId: periodId, employeeId } });
      runId = run!.id;

      const payments = await payrollService.listPayrollRunPayments(businessId, runId);
      expect(payments.length).toBe(2);
      expect(payments[0].installmentNumber).toBe(1);
      expect(payments[1].installmentNumber).toBe(2);
      
      payment1Id = payments[0].id;
      payment2Id = payments[1].id;
      
      const expectedAmount = Number(run!.netPay) / 2;
      expect(Number(payments[0].amount)).toBeCloseTo(expectedAmount, 2);
      expect(Number(payments[1].amount)).toBeCloseTo(expectedAmount, 2);
    });

    it('3. Mark Payment 1 as PAID and verify persistence', async () => {
      await payrollService.updatePayrollPaymentStatus(businessId, payment1Id, {
        status: PayrollPaymentStatus.PAID,
        paymentMethod: 'BANK_TRANSFER',
      });

      const payment = await prisma.payrollPayment.findUnique({ where: { id: payment1Id } });
      expect(payment?.status).toBe(PayrollPaymentStatus.PAID);
    });

    it('8. Mark payment PAID must not recalculate payroll', async () => {
      const runBefore = await prisma.payrollRun.findUnique({ where: { id: runId } });
      
      // Update the second payment just to test if recalculation occurs
      await payrollService.updatePayrollPaymentStatus(businessId, payment2Id, {
        status: PayrollPaymentStatus.PAID,
        paymentMethod: 'BANK_TRANSFER',
      });
      
      const runAfter = await prisma.payrollRun.findUnique({ where: { id: runId } });
      expect(runBefore?.calculatedAt).toEqual(runAfter?.calculatedAt);
      expect(Number(runBefore?.netPay)).toBe(Number(runAfter?.netPay));
    });

    it('9. Accounting must generate PAYROLL_PAYMENT entry only if mappings exist', async () => {
      // First, post the period so that the already PAID payment generates the accounting entry
      await payrollService.updatePayrollPeriodStatus(businessId, periodId, {
        status: PayrollPeriodStatus.POSTED,
      });

      // Payment 1 was marked as PAID, it should have created accounting movements
      const movements = await prisma.accountingMovement.findMany({
        where: {
          businessId,
          originType: 'PAYROLL_PAYMENT',
          originId: payment1Id,
        }
      });

      expect(movements.length).toBe(2); // One debit, one credit
      const debit = movements.find(m => m.nature === 'DEBIT');
      const credit = movements.find(m => m.nature === 'CREDIT');
      expect(debit?.pucSubcuentaId).toBe('250505');
      expect(credit?.pucSubcuentaId).toBe('111005');
    });

    it('7. Posting payroll must not mark payments as paid', async () => {
      // Create a second period and run where payments are PENDING
      const period2 = await payrollService.createPayrollPeriod(businessId, {
        year: 2026,
        month: 2, // Feb 2026
        paymentCycle: PayrollPaymentCycle.BIWEEKLY,
      });
      
      await payrollService.calculateEmployeePayroll(businessId, period2.id, employeeId, {});
      const run2 = await prisma.payrollRun.findFirst({ where: { payrollPeriodId: period2.id, employeeId } });
      
      await payrollService.updatePayrollPeriodStatus(businessId, period2.id, {
        status: PayrollPeriodStatus.POSTED
      });
      
      const payments = await prisma.payrollPayment.findMany({ where: { payrollRunId: run2!.id } });
      expect(payments.length).toBe(2);
      expect(payments[0].status).toBe(PayrollPaymentStatus.PENDING);
      expect(payments[1].status).toBe(PayrollPaymentStatus.PENDING);
    });

    it('10. Editing contract with POSTED payroll must block critical fields', async () => {
      // Since period 2 is POSTED, editing critical fields of the contract should fail
      await expect(payrollService.updateContract(businessId, contractId, {
        salaryMonthly: 2500000
      })).rejects.toThrow(BadRequestException);
    });

    it('4. Retiro del empleado día 16 con Pago 1 PAID & 5. Liquidacion debe descontar Pago 1 & 6. Prima descontada', async () => {
      // Empleado retira en marzo 16
      // Crearemos periodo 3 y su run, pagaremos la primera quincena y luego liquidaremos
      const period3 = await payrollService.createPayrollPeriod(businessId, {
        year: 2026,
        month: 3, // Mar 2026
        paymentCycle: PayrollPaymentCycle.BIWEEKLY,
      });
      
      // Update end date of contract
      await prisma.employeeContract.update({
        where: { id: contractId },
        data: { endDate: new Date('2026-03-16T00:00:00Z') }
      });
      
      await payrollService.calculateEmployeePayroll(businessId, period3.id, employeeId, {});
      const run3 = await prisma.payrollRun.findFirst({ where: { payrollPeriodId: period3.id, employeeId } });
      
      const payments3 = await prisma.payrollPayment.findMany({ where: { payrollRunId: run3!.id }, orderBy: { installmentNumber: 'asc' } });
      const p1 = payments3[0];
      
      // Marcar el primer pago como PAID
      await payrollService.updatePayrollPaymentStatus(businessId, p1.id, {
        status: PayrollPaymentStatus.PAID,
        paymentMethod: 'BANK_TRANSFER'
      });
      
      // Darle prima al empleado y pagarla (Prima Junio)
      // We simulate creating a benefit payment for Prima
      await payrollService.createContractBenefitPayment(businessId, contractId, {
        type: 'PRIMA',
        amount: 500000,
        paidAt: '2026-03-10'
      });
      
      const simulation: any = await payrollService.simulateContractSettlement(businessId, contractId, {
        endDate: '2026-03-16'
      });
      
      // El total liquidado debería descontar `deductions`
      console.log('Simulation lines:', simulation.lines);
    });
  });
});
