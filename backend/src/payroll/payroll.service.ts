import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingMovementOriginType,
  MovementNature,
  PaymentMethod,
  PayrollAccountingSide,
  PayrollAdjustmentType,
  PayrollBenefitPaymentType,
  PayrollConceptCategory,
  PayrollContractType,
  PayrollPaymentStatus,
  PayrollPaymentType,
  PayrollPaymentCycle,
  PayrollPeriodStatus,
  PayrollSettlementStatus,
  PayrollSettlementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGlobalConfigDto } from './dto/update-global-config.dto';
import { UpdateBusinessConfigDto } from './dto/update-business-config.dto';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import {
  CreateEmployeeContractDto,
  UpdateEmployeeContractDto,
} from './dto/contract.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodStatusDto } from './dto/update-payroll-period-status.dto';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreateContractSettlementDto } from './dto/create-contract-settlement.dto';
import { SimulateContractSettlementDto } from './dto/simulate-contract-settlement.dto';
import { QueryContractSettlementsDto } from './dto/query-contract-settlements.dto';
import {
  CreatePayrollBenefitPaymentDto,
  CreatePayrollPaymentDto,
  UpdatePayrollPaymentStatusDto,
} from './dto/payroll-payment.dto';

type PayrollTx = Prisma.TransactionClient | PrismaService;

type PayrollPeriodRef = {
  year: number;
  month: number;
  paymentCycle?: PayrollPaymentCycle;
  installmentNumber?: number | null;
};

const EARNING_CODES_WITHOUT_CREDIT = new Set([
  'SALARY',
  'TRANSPORT_ALLOWANCE',
  'CONNECTIVITY_ALLOWANCE',
  'COMMISSIONS',
  'NON_SALARY_BONUS',
  'OVERTIME_TOTAL',
]);

const DATAICO_TRUNCATED_BENEFIT_PROFILE = 'DATAICO_TRUNCATED';
const DATAICO_TRUNCATED_SEVERANCE_RATE = new Prisma.Decimal('0.0833');
const DATAICO_TRUNCATED_SERVICE_BONUS_RATE = new Prisma.Decimal('0.0833');
const DATAICO_TRUNCATED_VACATION_RATE = new Prisma.Decimal('0.0417');
const DATAICO_TRUNCATED_SEVERANCE_INTEREST_RATE = new Prisma.Decimal('0.12');

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(private readonly prisma: PrismaService) {}

  private parseYear(year: string) {
    const parsed = Number(year);
    if (!Number.isInteger(parsed) || parsed < 1900) {
      throw new BadRequestException('Invalid year');
    }
    return parsed;
  }

  private parseDate(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return parsed;
  }

  private normalizeText(value?: string | null) {
    if (value == null) return undefined;
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeNullableText(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private isUniqueError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async findActiveGlobalParameter(year: number, tx: PayrollTx = this.prisma) {
    return tx.payrollGlobalParameter.findFirst({
      where: { year, isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  private async getActiveGlobalParameterOrThrow(
    year: number,
    tx: PayrollTx = this.prisma,
  ) {
    const globalParameter = await this.findActiveGlobalParameter(year, tx);
    if (!globalParameter) {
      throw new NotFoundException('Payroll global parameter not found');
    }
    return globalParameter;
  }

  private async getConfiguredSmmlv(
    businessId: string,
    year: number,
    tx: PayrollTx = this.prisma,
  ) {
    const businessParameter = await tx.payrollBusinessParameter.findUnique({
      where: { businessId_year: { businessId, year } },
    });

    if (businessParameter?.customSmmlv) {
      return businessParameter.customSmmlv;
    }

    const globalParameter = await this.getActiveGlobalParameterOrThrow(year, tx);
    return globalParameter.smmlv;
  }

  private async assertMinimumSalary(
    businessId: string,
    startDate: Date,
    salaryMonthly: number | Prisma.Decimal,
    tx: PayrollTx = this.prisma,
  ) {
    const smmlv = await this.getConfiguredSmmlv(
      businessId,
      startDate.getUTCFullYear(),
      tx,
    );
    if (new Prisma.Decimal(salaryMonthly).lessThan(smmlv)) {
      throw new BadRequestException(
        'El salario mensual no puede ser inferior al salario mínimo legal vigente.',
      );
    }
  }

  private async assertEmployeeBelongsToBusiness(
    businessId: string,
    employeeId: string,
    tx: PayrollTx = this.prisma,
  ) {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, businessId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async assertCatalogReferences(
    arlRiskClassId?: string | null,
    ciiuId?: string | null,
    tx: PayrollTx = this.prisma,
  ) {
    if (arlRiskClassId) {
      const arl = await tx.payrollArlRiskClass.findFirst({
        where: { id: arlRiskClassId, isActive: true },
      });
      if (!arl) throw new BadRequestException('arlRiskClassId is invalid');
    }

    if (ciiuId) {
      const ciiu = await tx.economicActivityCiiu.findFirst({
        where: { id: ciiuId, isActive: true },
      });
      if (!ciiu) throw new BadRequestException('ciiuId is invalid');
    }
  }

  async getGlobalConfig(yearParam: string) {
    const year = this.parseYear(yearParam);
    const globalParameter = await this.prisma.payrollGlobalParameter.findFirst({
      where: { year, isActive: true },
      orderBy: { version: 'desc' },
      include: {
        overtimeRates: { where: { isActive: true }, orderBy: { code: 'asc' } },
        solidarityBrackets: { orderBy: { fromSmmlv: 'asc' } },
      },
    });
    if (!globalParameter) {
      throw new NotFoundException('Payroll global parameter not found');
    }
    return globalParameter;
  }

  async updateGlobalConfig(
    yearParam: string,
    userId: string | undefined,
    dto: UpdateGlobalConfigDto,
  ) {
    const year = this.parseYear(yearParam);
    const keys = Object.keys(dto) as (keyof UpdateGlobalConfigDto)[];
    if (!keys.length) throw new BadRequestException('No fields to update');

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getActiveGlobalParameterOrThrow(year, tx);

      const changedFields: Record<
        string,
        { previous: string | null; next: string | number | boolean | null }
      > = {};
      for (const key of keys) {
        const current = existing[key as keyof typeof existing] as unknown;
        const previous = current === null || current === undefined ? null : String(current);
        const next = dto[key];
        if (previous !== String(next)) {
          changedFields[key] = { previous, next: next ?? null };
        }
      }

      const updated = await tx.payrollGlobalParameter.update({
        where: { id: existing.id },
        data: dto as Prisma.PayrollGlobalParameterUpdateInput,
        include: {
          overtimeRates: { where: { isActive: true }, orderBy: { code: 'asc' } },
          solidarityBrackets: { orderBy: { fromSmmlv: 'asc' } },
        },
      });

      if (Object.keys(changedFields).length) {
        await tx.payrollLegalUpdateNotice.create({
          data: {
            globalParameterId: existing.id,
            year,
            title: `Payroll legal parameters updated for ${year}`,
            description: 'Active payroll global parameters were updated.',
            changedFields: changedFields as Prisma.InputJsonObject,
            createdByUserId: userId,
          },
        });
      }

      return updated;
    });
  }

  async getBusinessConfig(businessId: string, yearParam: string) {
    const year = this.parseYear(yearParam);
    const [businessParameter, globalFallback] = await Promise.all([
      this.prisma.payrollBusinessParameter.findUnique({
        where: { businessId_year: { businessId, year } },
        include: { globalParameter: true },
      }),
      this.findActiveGlobalParameter(year),
    ]);

    return {
      businessParameter,
      globalFallback: businessParameter ? null : globalFallback,
    };
  }

  async updateBusinessConfig(
    businessId: string,
    yearParam: string,
    dto: UpdateBusinessConfigDto,
  ) {
    const year = this.parseYear(yearParam);
    const globalParameter = await this.findActiveGlobalParameter(year);

    return this.prisma.payrollBusinessParameter.upsert({
      where: { businessId_year: { businessId, year } },
      create: {
        businessId,
        year,
        globalParameterId: globalParameter?.id,
        ...dto,
      },
      update: {
        globalParameterId: globalParameter?.id,
        ...dto,
      },
      include: { globalParameter: true },
    });
  }

  async listCiiu(q?: string, limitParam?: string) {
    const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 100);
    const search = q?.trim();
    return this.prisma.economicActivityCiiu.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
      take: limit,
    });
  }

  async listArlRisks() {
    return this.prisma.payrollArlRiskClass.findMany({
      where: { isActive: true },
      orderBy: { level: 'asc' },
    });
  }

  async listOvertimeRates(yearParam: string) {
    const year = this.parseYear(yearParam);
    const globalParameter = await this.getActiveGlobalParameterOrThrow(year);
    return this.prisma.payrollOvertimeRate.findMany({
      where: { globalParameterId: globalParameter.id, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async listSolidarityBrackets(yearParam: string) {
    const year = this.parseYear(yearParam);
    const globalParameter = await this.getActiveGlobalParameterOrThrow(year);
    return this.prisma.payrollSolidarityBracket.findMany({
      where: { globalParameterId: globalParameter.id },
      orderBy: { fromSmmlv: 'asc' },
    });
  }

  async createEmployee(businessId: string, dto: CreateEmployeeDto) {
    const documentNumber = this.normalizeText(dto.documentNumber);
    if (!documentNumber) {
      throw new BadRequestException('documentNumber is required');
    }

    try {
      return await this.prisma.employee.create({
        data: {
          businessId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          documentType: this.normalizeNullableText(dto.documentType),
          documentNumber,
          position: this.normalizeNullableText(dto.position),
          email: this.normalizeNullableText(dto.email),
          phone: this.normalizeNullableText(dto.phone),
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Employee documentNumber already exists');
      }
      throw error;
    }
  }

  async listEmployees(businessId: string, q?: string, isActiveParam?: string) {
    const search = q?.trim();
    if (
      isActiveParam !== undefined &&
      isActiveParam !== 'true' &&
      isActiveParam !== 'false'
    ) {
      throw new BadRequestException('isActive must be true or false');
    }
    const isActive =
      isActiveParam === undefined ? undefined : isActiveParam === 'true';

    return this.prisma.employee.findMany({
      where: {
        businessId,
        ...(isActive === undefined ? {} : { isActive }),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { documentNumber: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEmployee(businessId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, businessId },
      include: { contracts: { orderBy: { startDate: 'desc' } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async updateEmployee(
    businessId: string,
    id: string,
    dto: UpdateEmployeeDto,
  ) {
    const existing = await this.assertEmployeeBelongsToBusiness(businessId, id);
    const nextDocumentNumber = this.normalizeText(dto.documentNumber);

    if (
      nextDocumentNumber &&
      nextDocumentNumber !== existing.documentNumber
    ) {
      const duplicated = await this.prisma.employee.findFirst({
        where: {
          businessId,
          documentNumber: nextDocumentNumber,
          NOT: { id },
        },
      });
      if (duplicated) {
        throw new ConflictException('Employee documentNumber already exists');
      }
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        documentType: this.normalizeNullableText(dto.documentType),
        documentNumber: nextDocumentNumber,
        position: this.normalizeNullableText(dto.position),
        email: this.normalizeNullableText(dto.email),
        phone: this.normalizeNullableText(dto.phone),
      },
    });
  }

  async deleteEmployee(businessId: string, id: string) {
    await this.assertEmployeeBelongsToBusiness(businessId, id);
    const activeContract = await this.prisma.employeeContract.findFirst({
      where: { businessId, employeeId: id, isActive: true },
    });
    if (activeContract) {
      throw new BadRequestException(
        'Employee has an active contract. Terminate or settle the contract before inactivating.',
      );
    }
    await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });
    return { ok: true };
  }

  async hardDeleteEmployee(businessId: string, id: string) {
    await this.assertEmployeeBelongsToBusiness(businessId, id);
    const [contracts, runs, settlements, payments] = await Promise.all([
      this.prisma.employeeContract.count({ where: { businessId, employeeId: id } }),
      this.prisma.payrollRun.count({ where: { businessId, employeeId: id } }),
      this.prisma.payrollContractSettlement.count({
        where: { businessId, employeeId: id },
      }),
      this.prisma.payrollPayment.count({ where: { businessId, employeeId: id } }),
    ]);
    if (contracts || runs || settlements || payments) {
      throw new BadRequestException(
        'Employee has payroll history and cannot be hard deleted.',
      );
    }
    await this.prisma.employee.delete({ where: { id } });
    return { ok: true };
  }

  private getInstallmentsCount(
    paymentCycle: PayrollPaymentCycle,
    installmentsCount?: number,
  ) {
    if (installmentsCount !== undefined) return installmentsCount;
    return paymentCycle === PayrollPaymentCycle.BIWEEKLY ? 2 : 1;
  }

  private decimal(value: unknown) {
    return new Prisma.Decimal((value ?? 0) as Prisma.Decimal.Value);
  }

  private money(value: Prisma.Decimal) {
    return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  }

  private reconcileBenefitsProvision(
    provisioned: {
      severance: Prisma.Decimal;
      severanceInterest: Prisma.Decimal;
      serviceBonus: Prisma.Decimal;
      vacation: Prisma.Decimal;
    },
    calculated: {
      severance: Prisma.Decimal;
      severanceInterest: Prisma.Decimal;
      serviceBonus: Prisma.Decimal;
      vacation: Prisma.Decimal;
    },
  ) {
    const reconcile = (
      provisionedAmount: Prisma.Decimal,
      calculatedAmount: Prisma.Decimal,
    ) => {
      const differenceAmount = calculatedAmount.sub(provisionedAmount);
      const differencePercent = calculatedAmount.equals(0)
        ? this.decimal(0)
        : differenceAmount.abs().div(calculatedAmount).mul(100);
      const status = differencePercent.lessThanOrEqualTo(1)
        ? 'OK'
        : differencePercent.lessThanOrEqualTo(5)
          ? 'WARNING'
          : 'ERROR';

      return {
        provisioned: this.money(provisionedAmount).toString(),
        calculated: this.money(calculatedAmount).toString(),
        differenceAmount: this.money(differenceAmount).toString(),
        differencePercent: differencePercent.toDecimalPlaces(4).toString(),
        status,
      };
    };

    const serviceBonus = calculated.serviceBonus;
    const result = {
      severance: reconcile(provisioned.severance, calculated.severance),
      severanceInterest: reconcile(
        provisioned.severanceInterest,
        calculated.severanceInterest,
      ),
      serviceBonus: reconcile(provisioned.serviceBonus, serviceBonus),
      vacation: reconcile(provisioned.vacation, calculated.vacation),
    };
    const provisionedTotal = provisioned.severance
      .add(provisioned.severanceInterest)
      .add(provisioned.serviceBonus)
      .add(provisioned.vacation);
    const calculatedTotal = calculated.severance
      .add(calculated.severanceInterest)
      .add(calculated.serviceBonus)
      .add(calculated.vacation);

    return {
      ...result,
      total: reconcile(provisionedTotal, calculatedTotal),
    };
  }

  private async payrollProvisionSumsUntilDate(
    businessId: string,
    contractId: string,
    endDate: Date,
    tx: PayrollTx,
  ) {
    const end = this.startOfUtcDay(endDate);
    const aggregate = await tx.payrollRun.aggregate({
      where: {
        businessId,
        contractId,
        period: {
          OR: [
            { year: { lt: end.getUTCFullYear() } },
            {
              year: end.getUTCFullYear(),
              month: { lt: end.getUTCMonth() + 1 },
            },
          ],
        },
      },
      _sum: {
        severance: true,
        severanceInterest: true,
        serviceBonus: true,
        vacation: true,
        salaryEarned: true,
        netPay: true,
      },
    });

    return {
      severance: this.decimal(aggregate._sum.severance),
      severanceInterest: this.decimal(aggregate._sum.severanceInterest),
      serviceBonus: this.decimal(aggregate._sum.serviceBonus),
      vacation: this.decimal(aggregate._sum.vacation),
      grossSalaryAccrued: this.decimal(aggregate._sum.salaryEarned),
      netSalaryAccrued: this.decimal(aggregate._sum.netPay),
    };
  }

  private paymentMethodCreditConcept(paymentMethod?: PaymentMethod | null) {
    if (paymentMethod === PaymentMethod.BANK_TRANSFER) {
      return 'PAYROLL_PAYMENT_BANK';
    }
    if (paymentMethod === PaymentMethod.OTHER) {
      return 'PAYROLL_PAYMENT_OTHER';
    }
    return 'PAYROLL_PAYMENT_CASH';
  }

  private async ensurePayrollRunPayments(
    run: {
      id: string;
      businessId: string;
      employeeId: string;
      contractId: string;
      netPay: Prisma.Decimal;
      contract?: { paymentCycle: PayrollPaymentCycle } | null;
    },
    tx: PayrollTx = this.prisma,
  ) {
    const existing = await tx.payrollPayment.findMany({
      where: {
        payrollRunId: run.id,
        type: PayrollPaymentType.SALARY_PAYMENT,
      },
    });
    if (existing.length) return existing;

    const paymentCycle = run.contract?.paymentCycle ?? PayrollPaymentCycle.MONTHLY;
    const netPay = this.money(this.decimal(run.netPay));
    const installments =
      paymentCycle === PayrollPaymentCycle.BIWEEKLY ? [1, 2] : [null];
    const firstAmount =
      paymentCycle === PayrollPaymentCycle.BIWEEKLY
        ? this.money(netPay.div(2))
        : netPay;
    const secondAmount =
      paymentCycle === PayrollPaymentCycle.BIWEEKLY
        ? this.money(netPay.sub(firstAmount))
        : netPay;

    await tx.payrollPayment.createMany({
      data: installments.map((installmentNumber) => ({
        businessId: run.businessId,
        payrollRunId: run.id,
        employeeId: run.employeeId,
        contractId: run.contractId,
        installmentNumber,
        paymentCycle,
        type: PayrollPaymentType.SALARY_PAYMENT,
        status: PayrollPaymentStatus.PENDING,
        amount:
          installmentNumber === 2
            ? secondAmount
            : firstAmount,
      })),
    });

    return tx.payrollPayment.findMany({
      where: { payrollRunId: run.id },
      orderBy: [{ installmentNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async recreatePayrollPaymentAccountingMovements(
    businessId: string,
    payment: {
      id: string;
      amount: Prisma.Decimal;
      paymentMethod: PaymentMethod | null;
      payrollRun: {
        period: { year: number; month: number };
        employee: { firstName: string; lastName: string };
      };
    },
    tx: PayrollTx,
  ) {
    await tx.accountingMovement.deleteMany({
      where: {
        businessId,
        originType: AccountingMovementOriginType.PAYROLL_PAYMENT,
        originId: payment.id,
      },
    });

    const mappings = await tx.payrollAccountingMapping.findMany({
      where: {
        businessId,
        isActive: true,
        conceptCode: {
          in: ['NET_PAY', this.paymentMethodCreditConcept(payment.paymentMethod)],
        },
      },
    });
    const debitMapping = mappings.find(
      (mapping) =>
        mapping.conceptCode === 'NET_PAY' &&
        mapping.side === PayrollAccountingSide.DEBIT,
    );
    const creditMapping = mappings.find(
      (mapping) =>
        mapping.conceptCode === this.paymentMethodCreditConcept(payment.paymentMethod) &&
        mapping.side === PayrollAccountingSide.CREDIT,
    );

    if (!debitMapping || !creditMapping) {
      this.logger.warn(
        `Payroll payment accounting mapping missing for paymentId=${payment.id}, businessId=${businessId}`,
      );
      return;
    }

    const employeeName = `${payment.payrollRun.employee.firstName} ${payment.payrollRun.employee.lastName}`;
    const date = new Date();
    const movements: Prisma.AccountingMovementCreateManyInput[] = [];
    for (const mapping of [debitMapping, creditMapping]) {
      const accountCode = mapping.accountCode.trim();
      if (accountCode.length !== 4 && accountCode.length !== 6) continue;
      movements.push({
        businessId,
        pucCuentaCode: accountCode.length === 4 ? accountCode : undefined,
        pucSubcuentaId: accountCode.length === 6 ? accountCode : undefined,
        amount: this.money(payment.amount),
        nature:
          mapping.side === PayrollAccountingSide.DEBIT
            ? MovementNature.DEBIT
            : MovementNature.CREDIT,
        date,
        detail: `Pago nomina ${payment.payrollRun.period.year}-${String(payment.payrollRun.period.month).padStart(2, '0')} ${employeeName}`,
        originType: AccountingMovementOriginType.PAYROLL_PAYMENT,
        originId: payment.id,
      });
    }

    if (movements.length === 2) {
      await tx.accountingMovement.createMany({ data: movements });
    }
  }

  private isSupplementaryHourType(type: PayrollAdjustmentType) {
    const supplementaryTypes: PayrollAdjustmentType[] = [
      PayrollAdjustmentType.NIGHT_SURCHARGE,
      PayrollAdjustmentType.OVERTIME_DAY,
      PayrollAdjustmentType.OVERTIME_NIGHT,
      PayrollAdjustmentType.SUNDAY_HOLIDAY_DAY,
      PayrollAdjustmentType.SUNDAY_HOLIDAY_EXTRA_DAY,
      PayrollAdjustmentType.SUNDAY_HOLIDAY_NIGHT,
      PayrollAdjustmentType.SUNDAY_HOLIDAY_EXTRA_NIGHT,
    ];
    return supplementaryTypes.includes(type);
  }

  private periodAccountingDate(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0, 12, 0, 0));
  }

  private startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private inclusiveCalendarDays(startDate: Date, endDate: Date) {
    const start = this.startOfUtcDay(startDate);
    const end = this.startOfUtcDay(endDate);
    const diff = end.getTime() - start.getTime();
    if (diff < 0) return -1;
    return Math.floor(diff / 86_400_000) + 1;
  }

  private overlapInclusiveDays(startDate: Date, endDate: Date, rangeStart: Date, rangeEnd: Date) {
    const start = new Date(Math.max(this.startOfUtcDay(startDate).getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(this.startOfUtcDay(endDate).getTime(), rangeEnd.getTime()));
    return this.inclusiveCalendarDays(start, end) < 0
      ? 0
      : this.inclusiveCalendarDays(start, end);
  }

  private dayForSettlement360(date: Date) {
    if (date.getUTCDate() === 31) {
      return 30;
    }
    return date.getUTCDate();
  }

  private settlementDays360(startDate: Date, endDate: Date) {
    const start = this.startOfUtcDay(startDate);
    const end = this.startOfUtcDay(endDate);
    if (end.getTime() < start.getTime()) return -1;

    const startDay = this.dayForSettlement360(start);
    const endDay = this.dayForSettlement360(end);

    const inclusiveAdjustment = start.getUTCDate() === 31 ? 0 : 1;

    return (
      (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
      (end.getUTCMonth() - start.getUTCMonth()) * 30 +
      (endDay - startDay) +
      inclusiveAdjustment
    );
  }

  private settlementOverlapDays360(
    startDate: Date,
    endDate: Date,
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    const start = new Date(Math.max(this.startOfUtcDay(startDate).getTime(), rangeStart.getTime()));
    const end = new Date(Math.min(this.startOfUtcDay(endDate).getTime(), rangeEnd.getTime()));
    const days = this.settlementDays360(start, end);
    return days < 0 ? 0 : days;
  }

  private splitSettlementDaysBySemester(startDate: Date, endDate: Date): {
    semester1Days: number;
    semester2Days: number;
    segments: Array<{
      year: number;
      semester: 1 | 2;
      startDate: string;
      endDate: string;
      days: number;
    }>;
  } {
    const start = this.startOfUtcDay(startDate);
    const end = this.startOfUtcDay(endDate);

    let semester1Days = 0;
    let semester2Days = 0;
    const segments: Array<{
      year: number;
      semester: 1 | 2;
      startDate: string;
      endDate: string;
      days: number;
    }> = [];

    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();

    for (let y = startYear; y <= endYear; y++) {
      // Semester 1
      const s1Start = new Date(Date.UTC(y, 0, 1));
      const s1End = new Date(Date.UTC(y, 5, 30));
      const s1OverlapStart = new Date(Math.max(start.getTime(), s1Start.getTime()));
      const s1OverlapEnd = new Date(Math.min(end.getTime(), s1End.getTime()));

      if (s1OverlapStart.getTime() <= s1OverlapEnd.getTime()) {
        const days = this.settlementDays360(s1OverlapStart, s1OverlapEnd);
        if (days > 0) {
          semester1Days += days;
          segments.push({
            year: y,
            semester: 1,
            startDate: s1OverlapStart.toISOString().slice(0, 10),
            endDate: s1OverlapEnd.toISOString().slice(0, 10),
            days,
          });
        }
      }

      // Semester 2
      const s2Start = new Date(Date.UTC(y, 6, 1));
      const s2End = new Date(Date.UTC(y, 11, 31));
      const s2OverlapStart = new Date(Math.max(start.getTime(), s2Start.getTime()));
      const s2OverlapEnd = new Date(Math.min(end.getTime(), s2End.getTime()));

      if (s2OverlapStart.getTime() <= s2OverlapEnd.getTime()) {
        const days = this.settlementDays360(s2OverlapStart, s2OverlapEnd);
        if (days > 0) {
          semester2Days += days;
          segments.push({
            year: y,
            semester: 2,
            startDate: s2OverlapStart.toISOString().slice(0, 10),
            endDate: s2OverlapEnd.toISOString().slice(0, 10),
            days,
          });
        }
      }
    }

    return { semester1Days, semester2Days, segments };
  }

  private normalizeInclusiveSettlementEndDate(endDate: Date) {
    return this.startOfUtcDay(endDate);
  }

  private async assertPeriodIsEditable(periodId: string, tx: PayrollTx = this.prisma) {
    const period = await tx.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Payroll period not found');
    if (
      period.status === PayrollPeriodStatus.POSTED ||
      period.status === PayrollPeriodStatus.CLOSED
    ) {
      throw new BadRequestException('Payroll period is not editable');
    }
    return period;
  }

  private async getPeriodForBusiness(
    businessId: string,
    periodId: string,
    tx: PayrollTx = this.prisma,
  ) {
    const period = await tx.payrollPeriod.findFirst({
      where: { id: periodId, businessId },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    return period;
  }

  async createContract(
    businessId: string,
    employeeId: string,
    dto: CreateEmployeeContractDto,
  ) {
    if (!Object.values(PayrollContractType).includes(dto.contractType)) {
      throw new BadRequestException('contractType is invalid');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertEmployeeBelongsToBusiness(businessId, employeeId, tx);
      await this.assertCatalogReferences(dto.arlRiskClassId, dto.ciiuId, tx);

      const startDate = this.parseDate(dto.startDate, 'startDate');
      const endDate = dto.endDate
        ? this.parseDate(dto.endDate, 'endDate')
        : undefined;
      await this.assertMinimumSalary(
        businessId,
        startDate,
        dto.salaryMonthly,
        tx,
      );

      await tx.employeeContract.updateMany({
        where: { businessId, employeeId, isActive: true },
        data: { isActive: false },
      });

      return tx.employeeContract.create({
        data: {
          businessId,
          employeeId,
          contractType: dto.contractType,
          salaryMonthly: dto.salaryMonthly,
          startDate,
          endDate,
          isRemote: dto.isRemote ?? false,
          applyLaw1819: dto.applyLaw1819 ?? true,
          paymentCycle: dto.paymentCycle,
          installmentsCount: this.getInstallmentsCount(
            dto.paymentCycle,
            dto.installmentsCount,
          ),
          arlRiskClassId: dto.arlRiskClassId,
          ciiuId: dto.ciiuId,
        },
      });
    });
  }

  async listContracts(businessId: string, employeeId: string) {
    await this.assertEmployeeBelongsToBusiness(businessId, employeeId);
    return this.prisma.employeeContract.findMany({
      where: { businessId, employeeId },
      orderBy: { startDate: 'desc' },
      include: { arlRiskClass: true, ciiu: true },
    });
  }

  async getContract(businessId: string, contractId: string) {
    const contract = await this.prisma.employeeContract.findFirst({
      where: { id: contractId, businessId },
      include: { employee: true, arlRiskClass: true, ciiu: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async updateContract(
    businessId: string,
    contractId: string,
    dto: UpdateEmployeeContractDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employeeContract.findFirst({
        where: { id: contractId, businessId },
      });
      if (!existing) throw new NotFoundException('Contract not found');

      await this.assertCatalogReferences(dto.arlRiskClassId, dto.ciiuId, tx);
      const criticalFields: (keyof UpdateEmployeeContractDto)[] = [
        'salaryMonthly',
        'startDate',
        'paymentCycle',
        'arlRiskClassId',
        'applyLaw1819',
        'isRemote',
      ];
      const changesCriticalField = criticalFields.some(
        (field) => dto[field] !== undefined,
      );
      if (changesCriticalField) {
        const postedRun = await tx.payrollRun.findFirst({
          where: {
            businessId,
            contractId,
            period: {
              status: {
                in: [PayrollPeriodStatus.POSTED, PayrollPeriodStatus.CLOSED],
              },
            },
          },
        });
        if (postedRun) {
          throw new BadRequestException(
            'Contract has posted payroll history. Create a new contract version for critical changes.',
          );
        }
      }

      const startDate = dto.startDate
        ? this.parseDate(dto.startDate, 'startDate')
        : existing.startDate;
      const endDate = dto.endDate
        ? this.parseDate(dto.endDate, 'endDate')
        : undefined;
      const salaryMonthly = dto.salaryMonthly ?? existing.salaryMonthly;

      if (dto.salaryMonthly !== undefined || dto.startDate !== undefined) {
        await this.assertMinimumSalary(
          businessId,
          startDate,
          salaryMonthly,
          tx,
        );
      }

      if (dto.isActive === true) {
        await tx.employeeContract.updateMany({
          where: {
            businessId,
            employeeId: existing.employeeId,
            isActive: true,
            NOT: { id: contractId },
          },
          data: { isActive: false },
        });
      }

      return tx.employeeContract.update({
        where: { id: contractId },
        data: {
          contractType: dto.contractType,
          salaryMonthly: dto.salaryMonthly,
          startDate: dto.startDate ? startDate : undefined,
          endDate,
          isRemote: dto.isRemote,
          applyLaw1819: dto.applyLaw1819,
          paymentCycle: dto.paymentCycle,
          installmentsCount: dto.installmentsCount,
          arlRiskClassId: dto.arlRiskClassId,
          ciiuId: dto.ciiuId,
          isActive: dto.isActive,
        },
      });
    });
  }

  async deleteContract(businessId: string, contractId: string) {
    const existing = await this.prisma.employeeContract.findFirst({
      where: { id: contractId, businessId },
    });
    if (!existing) throw new NotFoundException('Contract not found');

    await this.prisma.employeeContract.update({
      where: { id: contractId },
      data: { isActive: false },
    });
    return { ok: true };
  }

  async createPayrollPeriod(businessId: string, dto: CreatePayrollPeriodDto) {
    const installmentNumber =
      dto.paymentCycle === PayrollPaymentCycle.BIWEEKLY
        ? (dto.installmentNumber ?? 1)
        : 1;

    if (
      dto.paymentCycle === PayrollPaymentCycle.BIWEEKLY &&
      ![1, 2].includes(installmentNumber)
    ) {
      throw new BadRequestException('installmentNumber must be 1 or 2');
    }

    const periodKey = {
      businessId,
      year: dto.year,
      month: dto.month,
      paymentCycle: dto.paymentCycle,
      installmentNumber,
    };

    try {
      return await this.prisma.payrollPeriod.create({
        data: {
          ...periodKey,
          status: PayrollPeriodStatus.OPEN,
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        const existing = await this.prisma.payrollPeriod.findUnique({
          where: {
            businessId_year_month_paymentCycle_installmentNumber: periodKey,
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async listPayrollPeriods(
    businessId: string,
    filters: { year?: string; month?: string; status?: string },
  ) {
    const year = filters.year ? Number(filters.year) : undefined;
    const month = filters.month ? Number(filters.month) : undefined;
    if (filters.year && !Number.isInteger(year)) {
      throw new BadRequestException('year is invalid');
    }
    if (filters.month && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new BadRequestException('month is invalid');
    }
    if (
      filters.status &&
      !Object.values(PayrollPeriodStatus).includes(
        filters.status as PayrollPeriodStatus,
      )
    ) {
      throw new BadRequestException('status is invalid');
    }

    return this.prisma.payrollPeriod.findMany({
      where: {
        businessId,
        ...(year ? { year } : {}),
        ...(month ? { month } : {}),
        ...(filters.status
          ? { status: filters.status as PayrollPeriodStatus }
          : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { installmentNumber: 'desc' }],
    });
  }

  async getPayrollPeriod(businessId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, businessId },
      include: {
        runs: {
          orderBy: { calculatedAt: 'desc' },
          include: { employee: true, contract: true },
        },
      },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    return period;
  }

  async updatePayrollPeriodStatus(
    businessId: string,
    id: string,
    dto: UpdatePayrollPeriodStatusDto,
  ) {
    const period = await this.getPeriodForBusiness(businessId, id);
    if (period.status === PayrollPeriodStatus.CLOSED) {
      throw new BadRequestException('Closed payroll periods cannot be modified');
    }
    if (
      dto.status === PayrollPeriodStatus.CLOSED &&
      period.status !== PayrollPeriodStatus.POSTED
    ) {
      throw new BadRequestException('Only POSTED periods can be closed');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.status === PayrollPeriodStatus.POSTED) {
        const runs = await tx.payrollRun.findMany({
          where: { businessId, payrollPeriodId: id },
          include: {
            employee: true,
            conceptResults: true,
          },
        });

        for (const run of runs) {
          await this.recreateAccountingMovements(
            businessId,
            period,
            run,
            `${run.employee.firstName} ${run.employee.lastName}`,
            run.conceptResults,
            tx,
          );

          const paidPayments = await tx.payrollPayment.findMany({
            where: { payrollRunId: run.id, status: PayrollPaymentStatus.PAID },
            include: {
              payrollRun: {
                include: { period: true, employee: true },
              },
            },
          });
          for (const payment of paidPayments) {
            await this.recreatePayrollPaymentAccountingMovements(
              businessId,
              payment,
              tx,
            );
          }
        }
      }

      return tx.payrollPeriod.update({
        where: { id },
        data: {
          status: dto.status,
          calculatedAt:
            dto.status === PayrollPeriodStatus.CALCULATED ? new Date() : undefined,
          postedAt: dto.status === PayrollPeriodStatus.POSTED ? new Date() : undefined,
          closedAt: dto.status === PayrollPeriodStatus.CLOSED ? new Date() : undefined,
        },
      });
    });
  }

  async createPayrollAdjustment(
    businessId: string,
    runId: string,
    dto: CreatePayrollAdjustmentDto,
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, businessId },
      include: { period: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (
      run.period.status === PayrollPeriodStatus.POSTED ||
      run.period.status === PayrollPeriodStatus.CLOSED
    ) {
      throw new BadRequestException('Payroll period is not editable');
    }
    if (this.isSupplementaryHourType(dto.type) && (!dto.quantity || dto.quantity <= 0)) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const maxSupplementaryHours = Number(
      (run.usedParameters as any)?.maxSupplementaryHours ?? 720,
    );
    if (this.isSupplementaryHourType(dto.type)) {
      const existing = await this.prisma.payrollAdjustment.findMany({
        where: { payrollRunId: runId },
        select: { type: true, quantity: true },
      });
      const currentHours = existing
        .filter((item) => this.isSupplementaryHourType(item.type))
        .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
      if (currentHours + (dto.quantity ?? 0) > maxSupplementaryHours) {
        throw new BadRequestException('maxSupplementaryHours exceeded');
      }
    }

    return this.prisma.payrollAdjustment.create({
      data: {
        payrollRunId: runId,
        type: dto.type,
        quantity: dto.quantity,
        rate: dto.rate,
        amount: dto.amount,
        description: this.normalizeNullableText(dto.description),
      },
    });
  }

  async deletePayrollAdjustment(businessId: string, id: string) {
    const adjustment = await this.prisma.payrollAdjustment.findFirst({
      where: { id, payrollRun: { businessId } },
      include: { payrollRun: { include: { period: true } } },
    });
    if (!adjustment) throw new NotFoundException('Payroll adjustment not found');
    if (
      adjustment.payrollRun.period.status === PayrollPeriodStatus.POSTED ||
      adjustment.payrollRun.period.status === PayrollPeriodStatus.CLOSED
    ) {
      throw new BadRequestException('Payroll period is not editable');
    }
    await this.prisma.payrollAdjustment.delete({ where: { id } });
    return { ok: true };
  }

  private async resolvePayrollParameters(
    businessId: string,
    year: number,
    tx: PayrollTx,
  ) {
    const [businessParameter, globalParameter] = await Promise.all([
      tx.payrollBusinessParameter.findUnique({
        where: { businessId_year: { businessId, year } },
      }),
      this.findActiveGlobalParameter(year, tx),
    ]);

    const globalParameterId = globalParameter?.id;
    const [overtimeRates, solidarityBrackets] = globalParameterId
      ? await Promise.all([
          tx.payrollOvertimeRate.findMany({
            where: { globalParameterId, isActive: true },
          }),
          tx.payrollSolidarityBracket.findMany({
            where: { globalParameterId },
            orderBy: { fromSmmlv: 'asc' },
          }),
        ])
      : [[], []];

    return {
      globalParameterId,
      smmlv: this.decimal(businessParameter?.customSmmlv ?? globalParameter?.smmlv ?? 1300000),
      transportAllowance: this.decimal(
        businessParameter?.customTransportAllowance ??
          globalParameter?.transportAllowance ??
          0,
      ),
      weeklyHours: this.decimal(businessParameter?.weeklyHours ?? globalParameter?.weeklyHours ?? 44),
      monthlyHours: this.decimal(businessParameter?.monthlyHours ?? globalParameter?.monthlyHours ?? 220),
      dailyHours: this.decimal(businessParameter?.dailyHours ?? globalParameter?.dailyHours ?? 8),
      maxWorkedDaysMonth:
        businessParameter?.maxWorkedDaysMonth ??
        globalParameter?.maxWorkedDaysMonth ??
        30,
      maxSupplementaryHours:
        businessParameter?.maxSupplementaryHours ??
        globalParameter?.maxSupplementaryHours ??
        720,
      healthEmployeeRate: this.decimal(globalParameter?.healthEmployeeRate ?? 0.04),
      pensionEmployeeRate: this.decimal(globalParameter?.pensionEmployeeRate ?? 0.04),
      healthEmployerRate: this.decimal(globalParameter?.healthEmployerRate ?? 0.085),
      pensionEmployerRate: this.decimal(globalParameter?.pensionEmployerRate ?? 0.12),
      compensationFundRate: this.decimal(globalParameter?.compensationFundRate ?? 0.04),
      senaRate: this.decimal(globalParameter?.senaRate ?? 0.02),
      icbfRate: this.decimal(globalParameter?.icbfRate ?? 0.03),
      severanceRate: this.decimal(globalParameter?.severanceRate ?? 0.0833),
      severanceInterestRate: this.decimal(globalParameter?.severanceInterestRate ?? 0.01),
      serviceBonusRate: this.decimal(globalParameter?.serviceBonusRate ?? 0.0833),
      vacationRate: this.decimal(globalParameter?.vacationRate ?? 0.0417),
      law1819ThresholdSmmlv: this.decimal(globalParameter?.law1819ThresholdSmmlv ?? 10),
      transportLimitSmmlv: this.decimal(globalParameter?.transportLimitSmmlv ?? 2),
      applyLaw1819: businessParameter?.applyLaw1819 ?? true,
      exemptEmployerHealthLaw1819:
        businessParameter?.exemptEmployerHealthLaw1819 ?? true,
      applySolidarityFund: businessParameter?.applySolidarityFund ?? true,
      applyIncomeTax: businessParameter?.applyIncomeTax ?? false,
      withholdingStatus:
        globalParameter?.withholdingStatus ?? 'DISABLED_FOR_FUTURE_UPDATE',
      overtimeRates,
      solidarityBrackets,
    };
  }

  private parametersSnapshot(params: Awaited<ReturnType<PayrollService['resolvePayrollParameters']>>) {
    return {
      globalParameterId: params.globalParameterId,
      smmlv: params.smmlv.toString(),
      transportAllowance: params.transportAllowance.toString(),
      weeklyHours: params.weeklyHours.toString(),
      monthlyHours: params.monthlyHours.toString(),
      dailyHours: params.dailyHours.toString(),
      maxWorkedDaysMonth: params.maxWorkedDaysMonth,
      maxSupplementaryHours: params.maxSupplementaryHours,
      healthEmployeeRate: params.healthEmployeeRate.toString(),
      pensionEmployeeRate: params.pensionEmployeeRate.toString(),
      healthEmployerRate: params.healthEmployerRate.toString(),
      pensionEmployerRate: params.pensionEmployerRate.toString(),
      compensationFundRate: params.compensationFundRate.toString(),
      senaRate: params.senaRate.toString(),
      icbfRate: params.icbfRate.toString(),
      severanceRate: params.severanceRate.toString(),
      severanceInterestRate: params.severanceInterestRate.toString(),
      serviceBonusRate: params.serviceBonusRate.toString(),
      vacationRate: params.vacationRate.toString(),
      law1819ThresholdSmmlv: params.law1819ThresholdSmmlv.toString(),
      transportLimitSmmlv: params.transportLimitSmmlv.toString(),
      applyLaw1819: params.applyLaw1819,
      exemptEmployerHealthLaw1819: params.exemptEmployerHealthLaw1819,
      applySolidarityFund: params.applySolidarityFund,
      applyIncomeTax: params.applyIncomeTax,
      withholdingStatus: params.withholdingStatus,
    } as Prisma.InputJsonObject;
  }

  private concept(
    code: string,
    name: string,
    category: PayrollConceptCategory,
    amount: Prisma.Decimal,
    extra: Partial<Prisma.PayrollConceptResultCreateManyInput> = {},
  ): Prisma.PayrollConceptResultCreateManyInput {
    return {
      payrollRunId: '',
      code,
      name,
      category,
      amount: this.money(amount),
      ...extra,
    };
  }

  private payrollCostBreakdown(values: {
    totalAccrued: Prisma.Decimal;
    netPay: Prisma.Decimal;
    employeeDeductions: Prisma.Decimal;
    employerContributions: Prisma.Decimal;
    socialBenefits: Prisma.Decimal;
    parafiscals: Prisma.Decimal;
    law1819Applied: boolean;
    exemptEmployerHealthLaw1819: boolean;
  }) {
    const realEmployerCost = values.totalAccrued
      .add(values.employerContributions)
      .add(values.parafiscals)
      .add(values.socialBenefits);

    return {
      realEmployerCost,
      breakdown: {
        costFormula:
          'TOTAL_ACCRUED_PLUS_EMPLOYER_CONTRIBUTIONS_AND_PROVISIONS',
        roundingStrategy: 'DECIMAL_FULL_PRECISION_ROUND_FINAL',
        totalAccrued: this.money(values.totalAccrued).toString(),
        netPay: this.money(values.netPay).toString(),
        employeeDeductions: this.money(values.employeeDeductions).toString(),
        employerContributions: this.money(
          values.employerContributions,
        ).toString(),
        socialBenefits: this.money(values.socialBenefits).toString(),
        parafiscals: this.money(values.parafiscals).toString(),
        law1819Applied: values.law1819Applied,
        exemptEmployerHealthLaw1819: values.exemptEmployerHealthLaw1819,
      },
    };
  }

  private monthlyBenefitProfile() {
    return {
      benefitProfile: DATAICO_TRUNCATED_BENEFIT_PROFILE,
      severanceRate: DATAICO_TRUNCATED_SEVERANCE_RATE,
      serviceBonusRate: DATAICO_TRUNCATED_SERVICE_BONUS_RATE,
      vacationRate: DATAICO_TRUNCATED_VACATION_RATE,
      severanceInterestRate: DATAICO_TRUNCATED_SEVERANCE_INTEREST_RATE,
      severanceInterestFormula: 'MONTHLY_SEVERANCE_X_12_PERCENT',
    };
  }

  private async recreateAccountingMovements(
    businessId: string,
    period: { year: number; month: number },
    run: { id: string; netPay: Prisma.Decimal },
    employeeName: string,
    concepts: Prisma.PayrollConceptResultCreateManyInput[],
    tx: PayrollTx,
  ) {
    await tx.accountingMovement.deleteMany({
      where: {
        businessId,
        originType: AccountingMovementOriginType.PAYROLL_RUN,
        originId: run.id,
      },
    });

    const conceptCodes = Array.from(
      new Set([...concepts.map((concept) => concept.code), 'NET_PAY']),
    );

    const mappings = await tx.payrollAccountingMapping.findMany({
      where: {
        businessId,
        isActive: true,
        conceptCode: { in: conceptCodes },
      },
    });

    const movements: Prisma.AccountingMovementCreateManyInput[] = [];
    for (const concept of concepts) {
      if (this.decimal(concept.amount).equals(0)) continue;

      const conceptMappings = mappings.filter(
        (mapping) => mapping.conceptCode === concept.code,
      );
      for (const mapping of conceptMappings) {
        if (
          mapping.side === PayrollAccountingSide.CREDIT &&
          EARNING_CODES_WITHOUT_CREDIT.has(concept.code)
        ) {
          continue;
        }

        const accountCode = mapping.accountCode.trim();
        if (accountCode.length !== 4 && accountCode.length !== 6) continue;
        movements.push({
          businessId,
          pucCuentaCode: accountCode.length === 4 ? accountCode : undefined,
          pucSubcuentaId: accountCode.length === 6 ? accountCode : undefined,
          amount: this.money(this.decimal(concept.amount)),
          nature:
            mapping.side === PayrollAccountingSide.DEBIT
              ? MovementNature.DEBIT
              : MovementNature.CREDIT,
          date: this.periodAccountingDate(period.year, period.month),
          detail: `Nomina ${period.year}-${String(period.month).padStart(2, '0')} ${employeeName} - ${concept.name}`,
          originType: AccountingMovementOriginType.PAYROLL_RUN,
          originId: run.id,
        });
      }
    }

    const netPay = this.decimal(run.netPay);
    const netPayMapping = mappings.find(
      (mapping) =>
        mapping.conceptCode === 'NET_PAY' &&
        mapping.side === PayrollAccountingSide.CREDIT,
    );

    if (netPay.gt(0) && netPayMapping) {
      const accountCode = netPayMapping.accountCode.trim();
      if (accountCode.length === 4 || accountCode.length === 6) {
        movements.push({
          businessId,
          pucCuentaCode: accountCode.length === 4 ? accountCode : undefined,
          pucSubcuentaId: accountCode.length === 6 ? accountCode : undefined,
          amount: this.money(netPay),
          nature: MovementNature.CREDIT,
          date: this.periodAccountingDate(period.year, period.month),
          detail: `Nomina ${period.year}-${String(period.month).padStart(2, '0')} ${employeeName} - Neto a pagar`,
          originType: AccountingMovementOriginType.PAYROLL_RUN,
          originId: run.id,
        });
      }
    }

    if (movements.length) {
      await tx.accountingMovement.createMany({ data: movements });
    }

    const totals = movements.reduce(
      (acc, movement) => {
        const amount = this.decimal(movement.amount);
        if (movement.nature === MovementNature.DEBIT) {
          acc.debit = acc.debit.plus(amount);
        } else {
          acc.credit = acc.credit.plus(amount);
        }
        return acc;
      },
      { debit: this.decimal(0), credit: this.decimal(0) },
    );

    if (!totals.debit.equals(totals.credit)) {
      this.logger.warn(
        `Payroll accounting movements are unbalanced for payrollRunId=${run.id}, businessId=${businessId}, debit=${totals.debit.toFixed(2)}, credit=${totals.credit.toFixed(2)}, difference=${totals.debit.minus(totals.credit).toFixed(2)}`,
      );
    }
  }

  async previewEmployeePayroll(
    businessId: string,
    periodId: string,
    employeeId: string,
    dto: CalculatePayrollDto = {},
  ) {
    const period = await this.getPeriodForBusiness(businessId, periodId);
    const employee = await this.assertEmployeeBelongsToBusiness(
      businessId,
      employeeId,
    );
    const periodStart = new Date(Date.UTC(period.year, period.month - 1, 1));
    const periodEnd = new Date(Date.UTC(period.year, period.month, 0));

    const contract = await this.prisma.employeeContract.findFirst({
      where: {
        businessId,
        employeeId,
        isActive: true,
        startDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
      },
      include: { arlRiskClass: true },
      orderBy: { startDate: 'desc' },
    });
    if (!contract) throw new NotFoundException('Active contract not found');

    const params = await this.resolvePayrollParameters(businessId, period.year, this.prisma);
    const workedDays =
      dto.workedDays ??
      (period.paymentCycle === PayrollPaymentCycle.BIWEEKLY ? 15 : 30);
    if (workedDays > params.maxWorkedDaysMonth) {
      throw new BadRequestException('workedDays exceeds maxWorkedDaysMonth');
    }

    const salaryMonthly = this.decimal(contract.salaryMonthly);
    const workedDaysDecimal = this.decimal(workedDays);
    const maxDays = this.decimal(params.maxWorkedDaysMonth);
    const salaryEarned = salaryMonthly.mul(workedDaysDecimal).div(maxDays);
    const qualifiesForTransport = salaryMonthly.lessThanOrEqualTo(
      params.smmlv.mul(params.transportLimitSmmlv),
    );
    const proportionalAllowance = qualifiesForTransport
      ? params.transportAllowance.mul(workedDaysDecimal).div(maxDays)
      : this.decimal(0);
    const transportAllowance = contract.isRemote
      ? this.decimal(0)
      : proportionalAllowance;
    const connectivityAllowance = contract.isRemote
      ? proportionalAllowance
      : this.decimal(0);
    const commissions = this.decimal(dto.commissions);
    const nonSalaryBonus = this.decimal(dto.nonSalaryBonus);
    const otherDeductions = this.decimal(dto.otherDeductions);
    const hourlyRate = salaryMonthly.div(params.monthlyHours);

    const totalOvertimeQuantity = (dto.overtimeHours ?? []).reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    if (totalOvertimeQuantity > params.maxSupplementaryHours) {
      throw new BadRequestException('maxSupplementaryHours exceeded');
    }

    let overtimeAmount = this.decimal(0);
    for (const item of dto.overtimeHours ?? []) {
      if (!this.isSupplementaryHourType(item.type) || item.quantity <= 0) {
        throw new BadRequestException('Invalid overtimeHours item');
      }
      const rate = params.overtimeRates.find((entry) => entry.code === item.type);
      if (!rate) {
        throw new BadRequestException(`Overtime rate not found for ${item.type}`);
      }
      overtimeAmount = overtimeAmount.add(
        hourlyRate.mul(item.quantity).mul(this.decimal(rate.factor)),
      );
    }

    const grossIncome = salaryEarned
      .add(transportAllowance)
      .add(connectivityAllowance)
      .add(commissions)
      .add(nonSalaryBonus)
      .add(overtimeAmount);
    const ibcAmount = salaryEarned.add(commissions).add(overtimeAmount);
    const employeeHealth = ibcAmount.mul(params.healthEmployeeRate);
    const employeePension = ibcAmount.mul(params.pensionEmployeeRate);
    const salaryInSmmlv = params.smmlv.equals(0)
      ? this.decimal(0)
      : ibcAmount.div(params.smmlv);
    const bracket = params.solidarityBrackets.find((item) => {
      const from = this.decimal(item.fromSmmlv);
      const to = item.toSmmlv ? this.decimal(item.toSmmlv) : null;
      return salaryInSmmlv.greaterThanOrEqualTo(from) && (!to || salaryInSmmlv.lessThan(to));
    });
    const solidarityFund =
      params.applySolidarityFund && bracket
        ? ibcAmount.mul(bracket.rate)
        : this.decimal(0);
    const withholdingTax = this.decimal(0);
    const totalEmployeeDeductions = employeeHealth
      .add(employeePension)
      .add(solidarityFund)
      .add(withholdingTax)
      .add(otherDeductions);
    const netPay = grossIncome.sub(totalEmployeeDeductions);

    const law1819Applies =
      contract.applyLaw1819 &&
      params.applyLaw1819 &&
      salaryMonthly.lessThan(params.smmlv.mul(params.law1819ThresholdSmmlv));
    const employerHealth = law1819Applies && params.exemptEmployerHealthLaw1819
      ? this.decimal(0)
      : ibcAmount.mul(params.healthEmployerRate);
    const employerPension = ibcAmount.mul(params.pensionEmployerRate);
    const employerArl = ibcAmount.mul(contract.arlRiskClass?.rate ?? 0);
    const compensationFund = ibcAmount.mul(params.compensationFundRate);
    const sena = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.senaRate);
    const icbf = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.icbfRate);

    const benefitBaseWithTransport = salaryEarned
      .add(transportAllowance)
      .add(connectivityAllowance)
      .add(commissions)
      .add(overtimeAmount);
    const vacationBase = salaryEarned.add(commissions).add(overtimeAmount);
    const benefitProfile = this.monthlyBenefitProfile();
    const severance = benefitBaseWithTransport.mul(benefitProfile.severanceRate);
    const monthlySeveranceInterestRate =
      benefitProfile.severanceInterestRate;
    const monthlySeveranceInterestProvision = severance.mul(
      monthlySeveranceInterestRate,
    );
    const severanceInterest = monthlySeveranceInterestProvision;
    const serviceBonus = benefitBaseWithTransport.mul(
      benefitProfile.serviceBonusRate,
    );
    const vacation = vacationBase.mul(benefitProfile.vacationRate);
    const totalEmployerContributions = employerHealth
      .add(employerPension)
      .add(employerArl);
    const totalParafiscals = compensationFund.add(sena).add(icbf);
    const totalBenefits = severance
      .add(severanceInterest)
      .add(serviceBonus)
      .add(vacation);
    const { realEmployerCost, breakdown: costBreakdown } =
      this.payrollCostBreakdown({
        totalAccrued: grossIncome,
        netPay,
        employeeDeductions: totalEmployeeDeductions,
        employerContributions: totalEmployerContributions,
        socialBenefits: totalBenefits,
        parafiscals: totalParafiscals,
        law1819Applied: law1819Applies,
        exemptEmployerHealthLaw1819: params.exemptEmployerHealthLaw1819,
      });

    return {
      id: `preview-${period.id}-${employee.id}`,
      businessId,
      payrollPeriodId: period.id,
      employeeId,
      contractId: contract.id,
      employee,
      contract,
      workedDays,
      baseSalary: this.money(salaryMonthly),
      salaryEarned: this.money(salaryEarned),
      transportAllowance: this.money(transportAllowance),
      connectivityAllowance: this.money(connectivityAllowance),
      commissions: this.money(commissions),
      nonSalaryBonus: this.money(nonSalaryBonus),
      overtimeAmount: this.money(overtimeAmount),
      grossIncome: this.money(grossIncome),
      ibcAmount: this.money(ibcAmount),
      employeeHealth: this.money(employeeHealth),
      employeePension: this.money(employeePension),
      solidarityFund: this.money(solidarityFund),
      withholdingTax: this.money(withholdingTax),
      otherDeductions: this.money(otherDeductions),
      totalEmployeeDeductions: this.money(totalEmployeeDeductions),
      netPay: this.money(netPay),
      employerHealth: this.money(employerHealth),
      employerPension: this.money(employerPension),
      employerArl: this.money(employerArl),
      compensationFund: this.money(compensationFund),
      sena: this.money(sena),
      icbf: this.money(icbf),
      severance: this.money(severance),
      severanceInterest: this.money(severanceInterest),
      serviceBonus: this.money(serviceBonus),
      vacation: this.money(vacation),
      totalEmployerContributions: this.money(totalEmployerContributions),
      totalParafiscals: this.money(totalParafiscals),
      totalBenefits: this.money(totalBenefits),
      realEmployerCost: this.money(realEmployerCost),
      payments: [],
      adjustments: [],
      conceptResults: [],
      usedParameters: {
        ...this.parametersSnapshot(params),
        costFormula: costBreakdown.costFormula,
        costRoundingStrategy: costBreakdown.roundingStrategy,
        costBreakdown,
        benefitProfile: benefitProfile.benefitProfile,
        severanceRateApplied: benefitProfile.severanceRate.toString(),
        serviceBonusRateApplied: benefitProfile.serviceBonusRate.toString(),
        vacationRateApplied: benefitProfile.vacationRate.toString(),
        severanceInterestFormula: benefitProfile.severanceInterestFormula,
        monthlySeveranceInterestProvision:
          monthlySeveranceInterestProvision.toString(),
        totalAccrued: costBreakdown.totalAccrued,
        netPay: costBreakdown.netPay,
        employeeDeductions: costBreakdown.employeeDeductions,
        employerContributions: costBreakdown.employerContributions,
        socialBenefits: costBreakdown.socialBenefits,
        parafiscals: costBreakdown.parafiscals,
        law1819Applied: law1819Applies,
        exemptEmployerHealthLaw1819: params.exemptEmployerHealthLaw1819,
      },
      preview: true,
      warnings:
        period.status === PayrollPeriodStatus.POSTED ||
        period.status === PayrollPeriodStatus.CLOSED
          ? ['Vista previa, no modifica el periodo posteado.']
          : [],
    };
  }

  async calculateEmployeePayroll(
    businessId: string,
    periodId: string,
    employeeId: string,
    dto: CalculatePayrollDto = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.getPeriodForBusiness(businessId, periodId, tx);
      await this.assertPeriodIsEditable(period.id, tx);
      const employee = await this.assertEmployeeBelongsToBusiness(
        businessId,
        employeeId,
        tx,
      );
      const contract = await tx.employeeContract.findFirst({
        where: { businessId, employeeId, isActive: true, startDate: { lte: new Date(Date.UTC(period.year, period.month, 0)) }, OR: [{ endDate: null }, { endDate: { gte: new Date(Date.UTC(period.year, period.month - 1, 1)) } }] },
        include: { arlRiskClass: true },
        orderBy: { startDate: 'desc' },
      });
      if (!contract) throw new NotFoundException('Active contract not found');

      const params = await this.resolvePayrollParameters(businessId, period.year, tx);
      const workedDays =
        dto.workedDays ??
        (period.paymentCycle === PayrollPaymentCycle.BIWEEKLY ? 15 : 30);
      if (workedDays > params.maxWorkedDaysMonth) {
        throw new BadRequestException('workedDays exceeds maxWorkedDaysMonth');
      }

      const salaryMonthly = this.decimal(contract.salaryMonthly);
      const workedDaysDecimal = this.decimal(workedDays);
      const maxDays = this.decimal(params.maxWorkedDaysMonth);
      const salaryEarned = salaryMonthly.mul(workedDaysDecimal).div(maxDays);
      const qualifiesForTransport = salaryMonthly.lessThanOrEqualTo(
        params.smmlv.mul(params.transportLimitSmmlv),
      );
      const proportionalAllowance = qualifiesForTransport
        ? params.transportAllowance.mul(workedDaysDecimal).div(maxDays)
        : this.decimal(0);
      const transportAllowance = contract.isRemote
        ? this.decimal(0)
        : proportionalAllowance;
      const connectivityAllowance = contract.isRemote
        ? proportionalAllowance
        : this.decimal(0);
      const commissions = this.decimal(dto.commissions);
      const nonSalaryBonus = this.decimal(dto.nonSalaryBonus);
      const otherDeductions = this.decimal(dto.otherDeductions);
      const hourlyRate = salaryMonthly.div(params.monthlyHours);

      const totalOvertimeQuantity = (dto.overtimeHours ?? []).reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      if (totalOvertimeQuantity > params.maxSupplementaryHours) {
        throw new BadRequestException('maxSupplementaryHours exceeded');
      }

      let overtimeAmount = this.decimal(0);
      const overtimeAdjustments: Prisma.PayrollAdjustmentCreateManyInput[] = [];
      for (const item of dto.overtimeHours ?? []) {
        if (!this.isSupplementaryHourType(item.type) || item.quantity <= 0) {
          throw new BadRequestException('Invalid overtimeHours item');
        }
        const rate = params.overtimeRates.find((entry) => entry.code === item.type);
        if (!rate) {
          throw new BadRequestException(`Overtime rate not found for ${item.type}`);
        }
        const factor = this.decimal(rate.factor);
        const amount = hourlyRate.mul(item.quantity).mul(factor);
        overtimeAmount = overtimeAmount.add(amount);
        overtimeAdjustments.push({
          payrollRunId: '',
          type: item.type,
          quantity: item.quantity,
          rate: factor,
          amount: this.money(amount),
          description: rate.name,
        });
      }

      const grossIncome = salaryEarned
        .add(transportAllowance)
        .add(connectivityAllowance)
        .add(commissions)
        .add(nonSalaryBonus)
        .add(overtimeAmount);
      const ibcAmount = salaryEarned.add(commissions).add(overtimeAmount);
      const employeeHealth = ibcAmount.mul(params.healthEmployeeRate);
      const employeePension = ibcAmount.mul(params.pensionEmployeeRate);
      const salaryInSmmlv = params.smmlv.equals(0)
        ? this.decimal(0)
        : ibcAmount.div(params.smmlv);
      const bracket = params.solidarityBrackets.find((item) => {
        const from = this.decimal(item.fromSmmlv);
        const to = item.toSmmlv ? this.decimal(item.toSmmlv) : null;
        return salaryInSmmlv.greaterThanOrEqualTo(from) && (!to || salaryInSmmlv.lessThan(to));
      });
      const solidarityFund =
        params.applySolidarityFund && bracket
          ? ibcAmount.mul(bracket.rate)
          : this.decimal(0);
      const withholdingTax = this.decimal(0);
      const totalEmployeeDeductions = employeeHealth
        .add(employeePension)
        .add(solidarityFund)
        .add(withholdingTax)
        .add(otherDeductions);
      const netPay = grossIncome.sub(totalEmployeeDeductions);

      const law1819Applies =
        contract.applyLaw1819 &&
        params.applyLaw1819 &&
        salaryMonthly.lessThan(params.smmlv.mul(params.law1819ThresholdSmmlv));
      const employerHealth = law1819Applies && params.exemptEmployerHealthLaw1819
        ? this.decimal(0)
        : ibcAmount.mul(params.healthEmployerRate);
      const employerPension = ibcAmount.mul(params.pensionEmployerRate);
      const employerArl = ibcAmount.mul(contract.arlRiskClass?.rate ?? 0);
      const compensationFund = ibcAmount.mul(params.compensationFundRate);
      const sena = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.senaRate);
      const icbf = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.icbfRate);

    const benefitBaseWithTransport = salaryEarned
      .add(transportAllowance)
      .add(connectivityAllowance)
      .add(commissions)
      .add(overtimeAmount);
    const vacationBase = salaryEarned.add(commissions).add(overtimeAmount);
      const benefitProfile = this.monthlyBenefitProfile();
      const severance = benefitBaseWithTransport.mul(
        benefitProfile.severanceRate,
      );
      const monthlySeveranceInterestRate =
        benefitProfile.severanceInterestRate;
      const monthlySeveranceInterestProvision = severance.mul(
        monthlySeveranceInterestRate,
      );
      const severanceInterest = monthlySeveranceInterestProvision;
      const serviceBonus = benefitBaseWithTransport.mul(
        benefitProfile.serviceBonusRate,
      );
      const vacation = vacationBase.mul(benefitProfile.vacationRate);
      const totalEmployerContributions = employerHealth
        .add(employerPension)
        .add(employerArl);
      const totalParafiscals = compensationFund.add(sena).add(icbf);
      const totalBenefits = severance
        .add(severanceInterest)
        .add(serviceBonus)
        .add(vacation);
      const { realEmployerCost, breakdown: costBreakdown } =
        this.payrollCostBreakdown({
          totalAccrued: grossIncome,
          netPay,
          employeeDeductions: totalEmployeeDeductions,
          employerContributions: totalEmployerContributions,
          socialBenefits: totalBenefits,
          parafiscals: totalParafiscals,
          law1819Applied: law1819Applies,
          exemptEmployerHealthLaw1819: params.exemptEmployerHealthLaw1819,
        });

      const runData = {
        businessId,
        payrollPeriodId: period.id,
        employeeId,
        contractId: contract.id,
        workedDays,
        baseSalary: this.money(salaryMonthly),
        salaryEarned: this.money(salaryEarned),
        transportAllowance: this.money(transportAllowance),
        connectivityAllowance: this.money(connectivityAllowance),
        commissions: this.money(commissions),
        nonSalaryBonus: this.money(nonSalaryBonus),
        overtimeAmount: this.money(overtimeAmount),
        grossIncome: this.money(grossIncome),
        ibcAmount: this.money(ibcAmount),
        employeeHealth: this.money(employeeHealth),
        employeePension: this.money(employeePension),
        solidarityFund: this.money(solidarityFund),
        withholdingTax: this.money(withholdingTax),
        otherDeductions: this.money(otherDeductions),
        totalEmployeeDeductions: this.money(totalEmployeeDeductions),
        netPay: this.money(netPay),
        employerHealth: this.money(employerHealth),
        employerPension: this.money(employerPension),
        employerArl: this.money(employerArl),
        compensationFund: this.money(compensationFund),
        sena: this.money(sena),
        icbf: this.money(icbf),
        severance: this.money(severance),
        severanceInterest: this.money(severanceInterest),
        serviceBonus: this.money(serviceBonus),
        vacation: this.money(vacation),
        totalEmployerContributions: this.money(totalEmployerContributions),
        totalParafiscals: this.money(totalParafiscals),
        totalBenefits: this.money(totalBenefits),
        realEmployerCost: this.money(realEmployerCost),
        usedParameters: {
          ...this.parametersSnapshot(params),
          employeeSnapshot: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            documentType: employee.documentType,
            documentNumber: employee.documentNumber,
            position: employee.position,
          },
          contractSnapshot: {
            id: contract.id,
            contractType: contract.contractType,
            salaryMonthly: contract.salaryMonthly.toString(),
            startDate: contract.startDate.toISOString(),
            endDate: contract.endDate?.toISOString() ?? null,
            paymentCycle: contract.paymentCycle,
            installmentsCount: contract.installmentsCount,
            arlRiskClassId: contract.arlRiskClassId,
            arlRate: String(contract.arlRiskClass?.rate ?? 0),
            applyLaw1819: contract.applyLaw1819,
            isRemote: contract.isRemote,
          },
          hourlyRate: hourlyRate.toString(),
          law1819Applies,
          law1819Applied: law1819Applies,
          exemptEmployerHealthLaw1819: params.exemptEmployerHealthLaw1819,
          arlRate: String(contract.arlRiskClass?.rate ?? 0),
          costFormula: costBreakdown.costFormula,
          costRoundingStrategy: costBreakdown.roundingStrategy,
          costBreakdown,
          benefitProfile: benefitProfile.benefitProfile,
          severanceRateApplied: benefitProfile.severanceRate.toString(),
          serviceBonusRateApplied: benefitProfile.serviceBonusRate.toString(),
          vacationRateApplied: benefitProfile.vacationRate.toString(),
          severanceInterestFormula: benefitProfile.severanceInterestFormula,
          monthlySeveranceInterestProvision:
            monthlySeveranceInterestProvision.toString(),
          totalAccrued: costBreakdown.totalAccrued,
          netPay: costBreakdown.netPay,
          employeeDeductions: costBreakdown.employeeDeductions,
          employerContributions: costBreakdown.employerContributions,
          socialBenefits: costBreakdown.socialBenefits,
          parafiscals: costBreakdown.parafiscals,
          benefitBaseWithTransport: benefitBaseWithTransport.toString(),
          benefitBaseWithTransportPolicy:
            'DATAICO_MONTHLY_SEVERANCE_AND_SERVICE_BONUS_INCLUDE_TRANSPORT_AND_CONNECTIVITY_ALLOWANCE',
          vacationBase: vacationBase.toString(),
          vacationBasePolicy:
            'DATAICO_MONTHLY_VACATION_EXCLUDES_TRANSPORT_AND_CONNECTIVITY_ALLOWANCE',
          monthlySeveranceInterestRate: monthlySeveranceInterestRate.toString(),
          monthlySeveranceInterestPolicy:
            'MONTHLY_SEVERANCE_X_12_PERCENT',
        },
        calculatedAt: new Date(),
      };

      const run = await tx.payrollRun.upsert({
        where: {
          payrollPeriodId_employeeId: {
            payrollPeriodId: period.id,
            employeeId,
          },
        },
        create: runData,
        update: runData,
      });

      await tx.payrollConceptResult.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollAdjustment.deleteMany({ where: { payrollRunId: run.id } });
      await tx.accountingMovement.deleteMany({
        where: {
          businessId,
          originType: AccountingMovementOriginType.PAYROLL_RUN,
          originId: run.id,
        },
      });

      if (overtimeAdjustments.length) {
        await tx.payrollAdjustment.createMany({
          data: overtimeAdjustments.map((item) => ({
            ...item,
            payrollRunId: run.id,
          })),
        });
      }

      const concepts = [
        this.concept('SALARY', 'Salary', PayrollConceptCategory.EARNING, salaryEarned, { quantity: workedDays, baseAmount: salaryMonthly }),
        this.concept('TRANSPORT_ALLOWANCE', 'Transport allowance', PayrollConceptCategory.EARNING, transportAllowance),
        this.concept('CONNECTIVITY_ALLOWANCE', 'Connectivity allowance', PayrollConceptCategory.EARNING, connectivityAllowance),
        this.concept('COMMISSIONS', 'Commissions', PayrollConceptCategory.EARNING, commissions),
        this.concept('NON_SALARY_BONUS', 'Non salary bonus', PayrollConceptCategory.EARNING, nonSalaryBonus),
        this.concept('OVERTIME_TOTAL', 'Overtime total', PayrollConceptCategory.EARNING, overtimeAmount),
        this.concept('EMPLOYEE_HEALTH', 'Employee health', PayrollConceptCategory.EMPLOYEE_DEDUCTION, employeeHealth, { baseAmount: ibcAmount, rate: params.healthEmployeeRate }),
        this.concept('EMPLOYEE_PENSION', 'Employee pension', PayrollConceptCategory.EMPLOYEE_DEDUCTION, employeePension, { baseAmount: ibcAmount, rate: params.pensionEmployeeRate }),
        this.concept('SOLIDARITY_FUND', 'Solidarity fund', PayrollConceptCategory.EMPLOYEE_DEDUCTION, solidarityFund, { baseAmount: ibcAmount, rate: bracket?.rate }),
        this.concept('WITHHOLDING_TAX', 'Withholding tax', PayrollConceptCategory.EMPLOYEE_DEDUCTION, withholdingTax),
        this.concept('OTHER_DEDUCTIONS', 'Other deductions', PayrollConceptCategory.EMPLOYEE_DEDUCTION, otherDeductions),
        this.concept('EMPLOYER_HEALTH', 'Employer health', PayrollConceptCategory.EMPLOYER_CONTRIBUTION, employerHealth, { baseAmount: ibcAmount, rate: params.healthEmployerRate }),
        this.concept('EMPLOYER_PENSION', 'Employer pension', PayrollConceptCategory.EMPLOYER_CONTRIBUTION, employerPension, { baseAmount: ibcAmount, rate: params.pensionEmployerRate }),
        this.concept('EMPLOYER_ARL', 'Employer ARL', PayrollConceptCategory.EMPLOYER_CONTRIBUTION, employerArl, { baseAmount: ibcAmount, rate: contract.arlRiskClass?.rate }),
        this.concept('COMPENSATION_FUND', 'Compensation fund', PayrollConceptCategory.PARAFISCAL, compensationFund, { baseAmount: ibcAmount, rate: params.compensationFundRate }),
        this.concept('SENA', 'SENA', PayrollConceptCategory.PARAFISCAL, sena, { baseAmount: ibcAmount, rate: params.senaRate }),
        this.concept('ICBF', 'ICBF', PayrollConceptCategory.PARAFISCAL, icbf, { baseAmount: ibcAmount, rate: params.icbfRate }),
        this.concept('SEVERANCE', 'Severance', PayrollConceptCategory.BENEFIT_PROVISION, severance, { baseAmount: benefitBaseWithTransport, rate: benefitProfile.severanceRate }),
        this.concept('SEVERANCE_INTEREST', 'Severance interest', PayrollConceptCategory.BENEFIT_PROVISION, severanceInterest, { baseAmount: severance, rate: monthlySeveranceInterestRate }),
        this.concept('SERVICE_BONUS', 'Service bonus', PayrollConceptCategory.BENEFIT_PROVISION, serviceBonus, { baseAmount: benefitBaseWithTransport, rate: benefitProfile.serviceBonusRate }),
        this.concept('VACATION', 'Vacation', PayrollConceptCategory.BENEFIT_PROVISION, vacation, { baseAmount: vacationBase, rate: benefitProfile.vacationRate }),
      ].map((concept) => ({ ...concept, payrollRunId: run.id }));

      await tx.payrollConceptResult.createMany({ data: concepts });
      await this.ensurePayrollRunPayments(
        {
          id: run.id,
          businessId,
          employeeId,
          contractId: contract.id,
          netPay: run.netPay,
          contract: { paymentCycle: contract.paymentCycle },
        },
        tx,
      );
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: { status: PayrollPeriodStatus.CALCULATED, calculatedAt: new Date() },
      });

      return tx.payrollRun.findUnique({
        where: { id: run.id },
        include: {
          employee: true,
          contract: true,
          adjustments: true,
          conceptResults: true,
          payments: true,
        },
      });
    });
  }

  async calculatePeriodPayroll(businessId: string, periodId: string) {
    const period = await this.getPeriodForBusiness(businessId, periodId);
    await this.assertPeriodIsEditable(period.id);
    const employees = await this.prisma.employee.findMany({
      where: { businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    let calculatedRuns = 0;
    const skippedEmployees: { employeeId: string; reason: string }[] = [];

    for (const employee of employees) {
      const activeContract = await this.prisma.employeeContract.findFirst({
        where: { businessId, employeeId: employee.id, isActive: true },
      });
      if (!activeContract) {
        skippedEmployees.push({
          employeeId: employee.id,
          reason: 'Active contract not found',
        });
        continue;
      }
      await this.calculateEmployeePayroll(businessId, periodId, employee.id, {});
      calculatedRuns += 1;
    }

    return {
      totalEmployees: employees.length,
      calculatedRuns,
      skippedEmployees,
    };
  }

  async getPayrollRun(businessId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, businessId },
      include: {
        employee: true,
        contract: true,
        adjustments: true,
        conceptResults: true,
        payments: true,
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async listPayrollRuns(businessId: string, periodId: string) {
    await this.getPeriodForBusiness(businessId, periodId);
    return this.prisma.payrollRun.findMany({
      where: { businessId, payrollPeriodId: periodId },
      orderBy: { calculatedAt: 'desc' },
      include: {
        employee: true,
        contract: true,
        adjustments: true,
        conceptResults: true,
        payments: true,
      },
    });
  }

  async listPayrollRunPayments(businessId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, businessId },
      include: { contract: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    await this.ensurePayrollRunPayments(run);
    return this.prisma.payrollPayment.findMany({
      where: { businessId, payrollRunId: runId },
      orderBy: [{ installmentNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPayrollRunPayment(
    businessId: string,
    runId: string,
    dto: CreatePayrollPaymentDto,
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, businessId },
      include: { contract: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    const amount = dto.amount === undefined ? run.netPay : dto.amount;
    if (this.decimal(amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('amount must be greater than 0');
    }

    return this.prisma.payrollPayment.create({
      data: {
        businessId,
        payrollRunId: run.id,
        employeeId: run.employeeId,
        contractId: run.contractId,
        installmentNumber: dto.installmentNumber ?? null,
        paymentCycle: run.contract.paymentCycle,
        type: dto.type ?? PayrollPaymentType.ADJUSTMENT,
        status: dto.paidAt
          ? PayrollPaymentStatus.PAID
          : PayrollPaymentStatus.PENDING,
        amount,
        paidAt: dto.paidAt ? this.parseDate(dto.paidAt, 'paidAt') : undefined,
        paymentMethod: dto.paymentMethod,
        notes: this.normalizeNullableText(dto.notes),
      },
    });
  }

  async updatePayrollPaymentStatus(
    businessId: string,
    paymentId: string,
    dto: UpdatePayrollPaymentStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payrollPayment.findFirst({
        where: { id: paymentId, businessId },
        include: {
          payrollRun: {
            include: {
              period: true,
              employee: true,
            },
          },
        },
      });
      if (!existing) throw new NotFoundException('Payroll payment not found');
      if (existing.status === PayrollPaymentStatus.CANCELLED) {
        throw new BadRequestException('Cancelled payroll payments cannot be modified');
      }

      const payment = await tx.payrollPayment.update({
        where: { id: paymentId },
        data: {
          status: dto.status,
          paidAt:
            dto.status === PayrollPaymentStatus.PAID
              ? dto.paidAt
                ? this.parseDate(dto.paidAt, 'paidAt')
                : existing.paidAt ?? new Date()
              : null,
          paymentMethod: dto.paymentMethod ?? existing.paymentMethod,
          notes: this.normalizeNullableText(dto.notes) ?? existing.notes,
        },
        include: {
          payrollRun: {
            include: {
              period: true,
              employee: true,
            },
          },
        },
      });

      if (payment.status === PayrollPaymentStatus.PAID) {
        if (payment.payrollRun.period.status === PayrollPeriodStatus.POSTED) {
          await this.recreatePayrollPaymentAccountingMovements(
            businessId,
            payment,
            tx,
          );
        }
      } else {
        await tx.accountingMovement.deleteMany({
          where: {
            businessId,
            originType: AccountingMovementOriginType.PAYROLL_PAYMENT,
            originId: payment.id,
          },
        });
      }

      return payment;
    });
  }

  async listContractBenefitPayments(businessId: string, contractId: string) {
    await this.getContractForSettlement(businessId, contractId);
    return this.prisma.payrollBenefitPayment.findMany({
      where: { businessId, contractId },
      orderBy: { paidAt: 'desc' },
    });
  }

  async createContractBenefitPayment(
    businessId: string,
    contractId: string,
    dto: CreatePayrollBenefitPaymentDto,
  ) {
    const contract = await this.getContractForSettlement(businessId, contractId);
    return this.prisma.payrollBenefitPayment.create({
      data: {
        businessId,
        employeeId: contract.employeeId,
        contractId,
        type: dto.type,
        amount: dto.amount,
        status: dto.status ?? PayrollPaymentStatus.PAID,
        paidAt: dto.paidAt ? this.parseDate(dto.paidAt, 'paidAt') : new Date(),
        periodId: dto.periodId,
        payrollRunId: dto.payrollRunId,
        settlementId: dto.settlementId,
        notes: this.normalizeNullableText(dto.notes),
      },
    });
  }

  private async getContractForSettlement(
    businessId: string,
    contractId: string,
    tx: PayrollTx = this.prisma,
  ) {
    const contract = await tx.employeeContract.findFirst({
      where: { id: contractId, businessId },
      include: {
        employee: true,
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  private settlementLine(
    code: string,
    name: string,
    amount: Prisma.Decimal,
    baseAmount: Prisma.Decimal,
    days: number | undefined,
    metadata: Prisma.InputJsonObject,
    rate?: Prisma.Decimal,
  ): Omit<Prisma.PayrollContractSettlementLineCreateManyInput, 'settlementId'> {
    return {
      code,
      name,
      amount: this.money(amount),
      baseAmount: this.money(baseAmount),
      rate,
      days,
      metadata,
    };
  }

  private withSettlementComputedFields<T extends { usedParameters?: unknown } | null>(
    settlement: T,
  ) {
    if (!settlement) return settlement;
    const current = settlement as Record<string, unknown>;
    const params = (settlement.usedParameters ?? {}) as Record<string, unknown>;
    return {
      ...settlement,
      requestedEndDate: current.requestedEndDate ?? params.requestedEndDate,
      calculationEndDate: current.calculationEndDate ?? params.calculationEndDate,
      salaryPending: current.salaryPending ?? params.salaryPending,
      benefitsTotal: current.benefitsTotal ?? params.benefitsTotal,
      settlementTotalPayable:
        current.settlementTotalPayable ?? params.settlementTotalPayable,
      serviceBonusTotal: current.serviceBonusTotal ?? params.serviceBonusTotal,
      grossSalaryAccrued:
        current.grossSalaryAccrued ?? params.grossSalaryAccrued,
      grossSalaryPaid: current.grossSalaryPaid ?? params.grossSalaryPaid,
      grossSalaryPending:
        current.grossSalaryPending ?? params.grossSalaryPending,
      netSalaryAccrued: current.netSalaryAccrued ?? params.netSalaryAccrued,
      netSalaryPaid: current.netSalaryPaid ?? params.netSalaryPaid,
      netSalaryPending: current.netSalaryPending ?? params.netSalaryPending,
      benefitsProvisioned:
        current.benefitsProvisioned ?? params.benefitsProvisioned,
      benefitsCalculated:
        current.benefitsCalculated ?? params.benefitsCalculated,
      reconciliationDifference:
        current.reconciliationDifference ?? params.reconciliationDifference,
      reconciliationPercent:
        current.reconciliationPercent ?? params.reconciliationPercent,
      benefitsReconciliation:
        current.benefitsReconciliation ?? params.benefitsReconciliation,
    };
  }

  private async calculateSettlementValues(
    businessId: string,
    contract: Awaited<ReturnType<PayrollService['getContractForSettlement']>>,
    endDate: Date,
    tx: PayrollTx,
  ) {
    const startDate = this.startOfUtcDay(contract.startDate);
    const requestedEndDate = this.startOfUtcDay(endDate);
    const calculationEndDate = this.normalizeInclusiveSettlementEndDate(requestedEndDate);
    const daysWorkedTotal360 = this.settlementDays360(startDate, calculationEndDate);
    if (daysWorkedTotal360 < 0) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const year = calculationEndDate.getUTCFullYear();
    const daysWorkedCurrentYear360 = this.settlementOverlapDays360(
      startDate,
      calculationEndDate,
      new Date(Date.UTC(year, 0, 1)),
      new Date(Date.UTC(year, 11, 31)),
    );
    const { semester1Days, semester2Days, segments } = this.splitSettlementDaysBySemester(
      startDate,
      calculationEndDate,
    );
    const daysWorkedSemester1 = semester1Days;
    const daysWorkedSemester2 = semester2Days;
    const referenceBenefitDays = daysWorkedCurrentYear360;

    const params = await this.resolvePayrollParameters(businessId, year, tx);
    const salaryMonthly = this.decimal(contract.salaryMonthly);
    const qualifiesForTransport = salaryMonthly.lessThanOrEqualTo(
      params.smmlv.mul(params.transportLimitSmmlv),
    );
    const settlementTransportAllowance =
      qualifiesForTransport && !contract.isRemote
        ? params.transportAllowance
        : this.decimal(0);
    const benefitSettlementBase = salaryMonthly.add(settlementTransportAllowance);
    const totalDays = this.decimal(daysWorkedTotal360);
    const benefitDays = this.decimal(referenceBenefitDays);
    const dailySalary = salaryMonthly.div(params.maxWorkedDaysMonth);
    const hourlyRate = salaryMonthly.div(params.monthlyHours);
    const grossSalaryAccrued = dailySalary.mul(totalDays);
    const paidSalaryRows = await tx.payrollPayment.findMany({
      where: {
        businessId,
        contractId: contract.id,
        status: PayrollPaymentStatus.PAID,
        type: {
          in: [
            PayrollPaymentType.SALARY_PAYMENT,
            PayrollPaymentType.ADVANCE,
          ],
        },
        OR: [{ paidAt: null }, { paidAt: { lte: calculationEndDate } }],
      },
      include: {
        payrollRun: {
          select: {
            salaryEarned: true,
            netPay: true,
          },
        },
      },
    });
    const netSalaryPaid = paidSalaryRows.reduce(
      (sum, payment) => sum.add(payment.amount),
      this.decimal(0),
    );
    const grossSalaryPaid = paidSalaryRows.reduce((sum, payment) => {
      const runNetPay = this.decimal(payment.payrollRun?.netPay);
      const runGrossSalary = this.decimal(payment.payrollRun?.salaryEarned);
      if (runNetPay.greaterThan(0) && runGrossSalary.greaterThan(0)) {
        return sum.add(runGrossSalary.mul(payment.amount).div(runNetPay));
      }
      return sum.add(payment.amount);
    }, this.decimal(0));
    const grossSalaryPending = grossSalaryAccrued.sub(grossSalaryPaid);
    const historicalProvisioned = await this.payrollProvisionSumsUntilDate(
      businessId,
      contract.id,
      calculationEndDate,
      tx,
    );
    const netSalaryAccrued = historicalProvisioned.netSalaryAccrued;
    const netSalaryPending = netSalaryAccrued.sub(netSalaryPaid);
    const salaryPaid = grossSalaryPaid;
    const salaryPending = grossSalaryPending;

    const benefitPaidRows = await tx.payrollBenefitPayment.groupBy({
      by: ['type'],
      where: {
        businessId,
        contractId: contract.id,
        status: PayrollPaymentStatus.PAID,
        OR: [{ paidAt: null }, { paidAt: { lte: calculationEndDate } }],
      },
      _sum: { amount: true },
    });
    const benefitPaid = (type: PayrollBenefitPaymentType) =>
      this.decimal(
        benefitPaidRows.find((row) => row.type === type)?._sum.amount,
      );

    const severanceCaused = benefitSettlementBase.mul(benefitDays).div(360);
    const severanceInterestCaused = severanceCaused.mul(0.12).mul(benefitDays).div(360);
    const serviceBonusSemesterOneCaused = benefitSettlementBase
      .mul(daysWorkedSemester1)
      .div(360);
    const serviceBonusSemesterTwoCaused = benefitSettlementBase
      .mul(daysWorkedSemester2)
      .div(360);
    const vacationDays = benefitDays.mul(15).div(360);
    const vacationCaused = salaryMonthly.mul(benefitDays).div(720);
    const serviceBonusPaid = benefitPaid(PayrollBenefitPaymentType.PRIMA);
    const severancePaid = benefitPaid(PayrollBenefitPaymentType.CESANTIAS);
    const severanceInterestPaid = benefitPaid(
      PayrollBenefitPaymentType.INTERESES_CESANTIAS,
    );
    const vacationPaid = benefitPaid(PayrollBenefitPaymentType.VACACIONES);
    const serviceBonusCaused = serviceBonusSemesterOneCaused.add(
      serviceBonusSemesterTwoCaused,
    );
    const severance = severanceCaused.sub(severancePaid);
    const severanceInterest = severanceInterestCaused.sub(severanceInterestPaid);
    const serviceBonusPending = serviceBonusCaused.sub(serviceBonusPaid);
    const serviceBonusSemesterOne =
      serviceBonusCaused.equals(0)
        ? this.decimal(0)
        : serviceBonusPending
            .mul(serviceBonusSemesterOneCaused)
            .div(serviceBonusCaused);
    const serviceBonusSemesterTwo = serviceBonusPending.sub(
      serviceBonusSemesterOne,
    );
    const vacation = vacationCaused.sub(vacationPaid);
    const benefitsTotal = severance
      .add(severanceInterest)
      .add(serviceBonusSemesterOne)
      .add(serviceBonusSemesterTwo)
      .add(vacation);
    const settlementTotalPayable = salaryPending.add(benefitsTotal);
    const serviceBonusCalculated = serviceBonusCaused;
    const benefitsCalculatedTotal = severanceCaused
      .add(severanceInterestCaused)
      .add(serviceBonusCalculated)
      .add(vacationCaused);
    const benefitsProvisionedTotal = historicalProvisioned.severance
      .add(historicalProvisioned.severanceInterest)
      .add(historicalProvisioned.serviceBonus)
      .add(historicalProvisioned.vacation);
    const benefitsReconciliation = this.reconcileBenefitsProvision(
      {
        severance: historicalProvisioned.severance,
        severanceInterest: historicalProvisioned.severanceInterest,
        serviceBonus: historicalProvisioned.serviceBonus,
        vacation: historicalProvisioned.vacation,
      },
      {
        severance: severanceCaused,
        severanceInterest: severanceInterestCaused,
        serviceBonus: serviceBonusCalculated,
        vacation: vacationCaused,
      },
    );
    const reconciliationDifference =
      benefitsCalculatedTotal.sub(benefitsProvisionedTotal);
    const reconciliationPercent = benefitsCalculatedTotal.equals(0)
      ? this.decimal(0)
      : reconciliationDifference.abs().div(benefitsCalculatedTotal).mul(100);

    const snapshot = {
      ...this.parametersSnapshot(params),
      employeeSnapshot: {
        id: contract.employee.id,
        firstName: contract.employee.firstName,
        lastName: contract.employee.lastName,
        documentType: contract.employee.documentType,
        documentNumber: contract.employee.documentNumber,
        position: contract.employee.position,
      },
      contractSnapshot: {
        id: contract.id,
        contractType: contract.contractType,
        salaryMonthly: contract.salaryMonthly.toString(),
        startDate: contract.startDate.toISOString(),
        endDate: contract.endDate?.toISOString() ?? null,
        paymentCycle: contract.paymentCycle,
        installmentsCount: contract.installmentsCount,
        applyLaw1819: contract.applyLaw1819,
        isRemote: contract.isRemote,
        arlRiskClassId: contract.arlRiskClassId,
      },
      settlementYear: year,
      requestedEndDate: requestedEndDate.toISOString(),
      calculationEndDate: calculationEndDate.toISOString(),
      daysWorkedTotal360,
      daysWorkedCurrentYear360,
      daysWorkedSemester1,
      daysWorkedSemester2,
      serviceBonusSegments: segments,
      daysWorkedForVacation: referenceBenefitDays,
      dailySalary: dailySalary.toString(),
      hourlyRate: hourlyRate.toString(),
      salaryMonthly: salaryMonthly.toString(),
      transportAllowance: settlementTransportAllowance.toString(),
      benefitSettlementBase: benefitSettlementBase.toString(),
      grossSalaryAccrued: grossSalaryAccrued.toString(),
      grossSalaryPaid: grossSalaryPaid.toString(),
      grossSalaryPending: grossSalaryPending.toString(),
      netSalaryAccrued: netSalaryAccrued.toString(),
      netSalaryPaid: netSalaryPaid.toString(),
      netSalaryPending: netSalaryPending.toString(),
      salaryAccrued: grossSalaryAccrued.toString(),
      salaryPaid: salaryPaid.toString(),
      salaryPending: salaryPending.toString(),
      benefitsTotal: benefitsTotal.toString(),
      settlementTotalPayable: settlementTotalPayable.toString(),
      serviceBonusTotal: serviceBonusPending.toString(),
      benefitsProvisioned: {
        severance: historicalProvisioned.severance.toString(),
        severanceInterest: historicalProvisioned.severanceInterest.toString(),
        serviceBonus: historicalProvisioned.serviceBonus.toString(),
        vacation: historicalProvisioned.vacation.toString(),
        total: benefitsProvisionedTotal.toString(),
      },
      benefitsCalculated: {
        severance: severanceCaused.toString(),
        severanceInterest: severanceInterestCaused.toString(),
        serviceBonus: serviceBonusCalculated.toString(),
        vacation: vacationCaused.toString(),
        total: benefitsCalculatedTotal.toString(),
      },
      reconciliationDifference: reconciliationDifference.toString(),
      reconciliationPercent: reconciliationPercent.toString(),
      benefitsReconciliation,
      paidBenefits: {
        severance: severancePaid.toString(),
        severanceInterest: severanceInterestPaid.toString(),
        serviceBonus: serviceBonusPaid.toString(),
        serviceBonusSemesterOne: serviceBonusPaid
          .mul(serviceBonusCaused.equals(0) ? 0 : serviceBonusSemesterOneCaused)
          .div(serviceBonusCaused.equals(0) ? 1 : serviceBonusCaused)
          .toString(),
        serviceBonusSemesterTwo: serviceBonusPaid
          .mul(serviceBonusCaused.equals(0) ? 0 : serviceBonusSemesterTwoCaused)
          .div(serviceBonusCaused.equals(0) ? 1 : serviceBonusCaused)
          .toString(),
        vacation: vacationPaid.toString(),
      },
      causedBenefits: {
        severance: severanceCaused.toString(),
        severanceInterest: severanceInterestCaused.toString(),
        serviceBonus: serviceBonusCaused.toString(),
        serviceBonusSemesterOne: serviceBonusSemesterOneCaused.toString(),
        serviceBonusSemesterTwo: serviceBonusSemesterTwoCaused.toString(),
        vacation: vacationCaused.toString(),
      },
      withholdingTax: '0',
      dayCountBasis: '30/360',
      formulas: {
        salaryPending: 'salaryMonthly / 30 * totalWorkedDays30_360 - paidSalary',
        benefitsTotal: 'severance + severanceInterest + serviceBonus + vacation',
        settlementTotalPayable: 'salaryPending + benefitsTotal',
        severance: '(salaryMonthly + transportAllowance) * benefitDays30_360 / 360',
        severanceInterest: 'severance * 0.12 * benefitDays30_360 / 360',
        serviceBonus: '(salaryMonthly + transportAllowance) * semesterDays30_360 / 360',
        serviceBonusSemesterOne: '(salaryMonthly + transportAllowance) * semesterOneDays30_360 / 360',
        serviceBonusSemesterTwo: '(salaryMonthly + transportAllowance) * semesterTwoDays30_360 / 360',
        vacationDays: 'benefitDays30_360 * 15 / 360',
        vacation: 'salaryMonthly * benefitDays30_360 / 720',
      },
    } as Prisma.InputJsonObject;

    const lines = [
      this.settlementLine(
        'SALARY_ACCRUED',
        'Salario causado',
        grossSalaryAccrued,
        salaryMonthly,
        daysWorkedTotal360,
        {
          basis: '30/360',
          formula: 'grossSalaryMonthly / 30 * totalWorkedDays30_360',
        },
      ),
      this.settlementLine(
        'SALARY_PAID',
        'Pagos salariales realizados',
        salaryPaid.neg(),
        salaryPaid,
        undefined,
        {
          source: 'PayrollPayment PAID',
          types: ['SALARY_PAYMENT', 'ADVANCE'],
        },
      ),
      this.settlementLine(
        'SALARY_PENDING',
        'Salario bruto pendiente',
        salaryPending,
        grossSalaryAccrued,
        daysWorkedTotal360,
        {
          formula: 'grossSalaryAccrued - grossSalaryPaid',
          canBeNegative: true,
        },
      ),
      this.settlementLine(
        'SEVERANCE',
        'Cesantias',
        severance,
        benefitSettlementBase,
        referenceBenefitDays,
        {
          basis: '30/360',
          formula:
            '(salaryMonthly + transportAllowance) * benefitDays30_360 / 360',
          salaryMonthly: salaryMonthly.toString(),
          transportAllowance: settlementTransportAllowance.toString(),
          causedAmount: severanceCaused.toString(),
          paidAmount: severancePaid.toString(),
        },
      ),
      this.settlementLine(
        'SEVERANCE_INTEREST',
        'Intereses cesantias',
        severanceInterest,
        severance,
        referenceBenefitDays,
        {
          basis: '30/360',
          formula: 'severance * 0.12 * benefitDays30_360 / 360',
          causedAmount: severanceInterestCaused.toString(),
          paidAmount: severanceInterestPaid.toString(),
        },
        new Prisma.Decimal(0.12),
      ),
      this.settlementLine(
        'SERVICE_BONUS_SEMESTER_ONE',
        'Prima de servicios I',
        serviceBonusSemesterOne,
        benefitSettlementBase,
        daysWorkedSemester1,
        {
          basis: '30/360',
          formula:
            '(salaryMonthly + transportAllowance) * semesterOneDays30_360 / 360',
          salaryMonthly: salaryMonthly.toString(),
          transportAllowance: settlementTransportAllowance.toString(),
          causedAmount: serviceBonusSemesterOneCaused.toString(),
          paidAmount: serviceBonusPaid.toString(),
        },
      ),
      this.settlementLine(
        'SERVICE_BONUS_SEMESTER_TWO',
        'Prima de servicios II',
        serviceBonusSemesterTwo,
        benefitSettlementBase,
        daysWorkedSemester2,
        {
          basis: '30/360',
          formula:
            '(salaryMonthly + transportAllowance) * semesterTwoDays30_360 / 360',
          salaryMonthly: salaryMonthly.toString(),
          transportAllowance: settlementTransportAllowance.toString(),
          causedAmount: serviceBonusSemesterTwoCaused.toString(),
          paidAmount: serviceBonusPaid.toString(),
        },
      ),
      this.settlementLine(
        'VACATION',
        'Vacaciones',
        vacation,
        salaryMonthly,
        referenceBenefitDays,
        {
          basis: '30/360',
          formula: 'salaryMonthly * benefitDays30_360 / 720',
          vacationDays: vacationDays.toDecimalPlaces(2).toString(),
          causedAmount: vacationCaused.toString(),
          paidAmount: vacationPaid.toString(),
        },
      ),
    ];

    return {
      startDate,
      endDate: calculationEndDate,
      requestedEndDate,
      calculationEndDate,
      totalWorkedDays: daysWorkedTotal360,
      semesterOneDays: daysWorkedSemester1,
      semesterTwoDays: daysWorkedSemester2,
      grossSalaryAccrued: this.money(grossSalaryAccrued),
      grossSalaryPaid: this.money(grossSalaryPaid),
      grossSalaryPending: this.money(grossSalaryPending),
      netSalaryAccrued: this.money(netSalaryAccrued),
      netSalaryPaid: this.money(netSalaryPaid),
      netSalaryPending: this.money(netSalaryPending),
      salaryPending: this.money(salaryPending),
      benefitsTotal: this.money(benefitsTotal),
      settlementTotalPayable: this.money(settlementTotalPayable),
      benefitsProvisioned: {
        severance: this.money(historicalProvisioned.severance),
        severanceInterest: this.money(historicalProvisioned.severanceInterest),
        serviceBonus: this.money(historicalProvisioned.serviceBonus),
        vacation: this.money(historicalProvisioned.vacation),
        total: this.money(benefitsProvisionedTotal),
      },
      benefitsCalculated: {
        severance: this.money(severanceCaused),
        severanceInterest: this.money(severanceInterestCaused),
        serviceBonus: this.money(serviceBonusCalculated),
        vacation: this.money(vacationCaused),
        total: this.money(benefitsCalculatedTotal),
      },
      reconciliationDifference: this.money(reconciliationDifference),
      reconciliationPercent: reconciliationPercent.toDecimalPlaces(4),
      benefitsReconciliation,
      severance: this.money(severance),
      severanceInterest: this.money(severanceInterest),
      serviceBonusSemesterOne: this.money(serviceBonusSemesterOne),
      serviceBonusSemesterTwo: this.money(serviceBonusSemesterTwo),
      serviceBonusTotal: this.money(serviceBonusSemesterOne.add(serviceBonusSemesterTwo)),
      vacation: this.money(vacation),
      vacationDays: vacationDays.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      hourlyRate: this.money(hourlyRate),
      totalAmount: this.money(settlementTotalPayable),
      usedParameters: snapshot,
      lines,
    };
  }

  private async createSettlement(
    businessId: string,
    contractId: string,
    type: PayrollSettlementType,
    endDate: Date,
    tx: PayrollTx,
  ) {
    const contract = await this.getContractForSettlement(businessId, contractId, tx);
    const calculated = await this.calculateSettlementValues(
      businessId,
      contract,
      endDate,
      tx,
    );

    const settlement = await tx.payrollContractSettlement.create({
      data: {
        businessId,
        employeeId: contract.employeeId,
        contractId: contract.id,
        type,
        status: PayrollSettlementStatus.CALCULATED,
        startDate: calculated.startDate,
        endDate: calculated.endDate,
        semesterOneDays: calculated.semesterOneDays,
        semesterTwoDays: calculated.semesterTwoDays,
        totalWorkedDays: calculated.totalWorkedDays,
        severance: calculated.severance,
        severanceInterest: calculated.severanceInterest,
        serviceBonusSemesterOne: calculated.serviceBonusSemesterOne,
        serviceBonusSemesterTwo: calculated.serviceBonusSemesterTwo,
        vacation: calculated.vacation,
        vacationDays: calculated.vacationDays,
        hourlyRate: calculated.hourlyRate,
        totalAmount: calculated.totalAmount,
        usedParameters: calculated.usedParameters,
      },
    });

    await tx.payrollContractSettlementLine.createMany({
      data: calculated.lines.map((line) => ({
        ...line,
        settlementId: settlement.id,
      })),
    });

    return settlement;
  }

  async simulateContractSettlement(
    businessId: string,
    contractId: string,
    dto: SimulateContractSettlementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await this.getContractForSettlement(businessId, contractId, tx);
      const endDate = dto.endDate
        ? this.parseDate(dto.endDate, 'endDate')
        : contract.endDate ?? new Date();
      const calculated = await this.calculateSettlementValues(
        businessId,
        contract,
        endDate,
        tx,
      );
      return this.withSettlementComputedFields({
        id: `simulation-${contract.id}-${this.startOfUtcDay(endDate).toISOString().slice(0, 10)}`,
        businessId,
        employeeId: contract.employeeId,
        contractId: contract.id,
        type: PayrollSettlementType.SIMULATION_TO_DATE,
        status: PayrollSettlementStatus.CALCULATED,
        startDate: calculated.startDate,
        endDate: calculated.endDate,
        semesterOneDays: calculated.semesterOneDays,
        semesterTwoDays: calculated.semesterTwoDays,
        totalWorkedDays: calculated.totalWorkedDays,
        requestedEndDate: calculated.requestedEndDate,
        calculationEndDate: calculated.calculationEndDate,
        salaryPending: calculated.salaryPending,
        benefitsTotal: calculated.benefitsTotal,
        settlementTotalPayable: calculated.settlementTotalPayable,
        serviceBonusTotal: calculated.serviceBonusTotal,
        grossSalaryAccrued: calculated.grossSalaryAccrued,
        grossSalaryPaid: calculated.grossSalaryPaid,
        grossSalaryPending: calculated.grossSalaryPending,
        netSalaryAccrued: calculated.netSalaryAccrued,
        netSalaryPaid: calculated.netSalaryPaid,
        netSalaryPending: calculated.netSalaryPending,
        benefitsProvisioned: calculated.benefitsProvisioned,
        benefitsCalculated: calculated.benefitsCalculated,
        reconciliationDifference: calculated.reconciliationDifference,
        reconciliationPercent: calculated.reconciliationPercent,
        benefitsReconciliation: calculated.benefitsReconciliation,
        severance: calculated.severance,
        severanceInterest: calculated.severanceInterest,
        serviceBonusSemesterOne: calculated.serviceBonusSemesterOne,
        serviceBonusSemesterTwo: calculated.serviceBonusSemesterTwo,
        vacation: calculated.vacation,
        vacationDays: calculated.vacationDays,
        hourlyRate: calculated.hourlyRate,
        totalAmount: calculated.totalAmount,
        usedParameters: calculated.usedParameters,
        employee: contract.employee,
        contract,
        lines: calculated.lines,
        preview: true,
      });
    });
  }

  async createContractSettlement(
    businessId: string,
    contractId: string,
    dto: CreateContractSettlementDto,
  ) {
    const endDate = this.parseDate(dto.endDate, 'endDate');

    return this.prisma.$transaction(async (tx) => {
      const contract = await this.getContractForSettlement(businessId, contractId, tx);
      if (this.startOfUtcDay(endDate).getTime() < this.startOfUtcDay(contract.startDate).getTime()) {
        throw new BadRequestException('endDate must be greater than or equal to startDate');
      }

      const existing = await tx.payrollContractSettlement.findFirst({
        where: {
          businessId,
          contractId,
          type: PayrollSettlementType.REAL_TERMINATION,
          status: {
            in: [
              PayrollSettlementStatus.CALCULATED,
              PayrollSettlementStatus.POSTED,
            ],
          },
        },
      });
      if (existing) {
        throw new ConflictException('Contract already has a real settlement');
      }

      const settlement = await this.createSettlement(
        businessId,
        contractId,
        PayrollSettlementType.REAL_TERMINATION,
        endDate,
        tx,
      );

      await tx.employeeContract.update({
        where: { id: contractId },
        data: { endDate: this.startOfUtcDay(endDate), isActive: false },
      });

      const persisted = await tx.payrollContractSettlement.findUnique({
        where: { id: settlement.id },
        include: { employee: true, contract: true, lines: true },
      });
      return this.withSettlementComputedFields(persisted);
    });
  }

  async listContractSettlements(
    businessId: string,
    query: QueryContractSettlementsDto,
  ) {
    const settlements = await this.prisma.payrollContractSettlement.findMany({
      where: {
        businessId,
        employeeId: query.employeeId,
        contractId: query.contractId,
        status: query.status,
        type: query.type,
      },
      orderBy: { calculatedAt: 'desc' },
      include: { employee: true, contract: true },
    });
    return settlements.map((settlement) =>
      this.withSettlementComputedFields(settlement),
    );
  }

  async getContractSettlement(businessId: string, id: string) {
    const settlement = await this.prisma.payrollContractSettlement.findFirst({
      where: { id, businessId },
      include: { employee: true, contract: true, lines: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return this.withSettlementComputedFields(settlement);
  }

  private async recreateSettlementAccountingMovements(
    businessId: string,
    settlement: {
      id: string;
      employee: { firstName: string; lastName: string };
      lines: { code: string; name: string; amount: Prisma.Decimal }[];
    },
    tx: PayrollTx,
  ) {
    await tx.accountingMovement.deleteMany({
      where: {
        businessId,
        originType: AccountingMovementOriginType.PAYROLL_SETTLEMENT,
        originId: settlement.id,
      },
    });

    const mappings = await tx.payrollAccountingMapping.findMany({
      where: {
        businessId,
        isActive: true,
        conceptCode: { in: settlement.lines.map((line) => line.code) },
      },
    });

    const movements: Prisma.AccountingMovementCreateManyInput[] = [];
    const employeeName = `${settlement.employee.firstName} ${settlement.employee.lastName}`;
    for (const line of settlement.lines) {
      if (this.decimal(line.amount).equals(0)) continue;
      const lineMappings = mappings.filter(
        (mapping) => mapping.conceptCode === line.code,
      );
      for (const mapping of lineMappings) {
        const accountCode = mapping.accountCode.trim();
        if (accountCode.length !== 4 && accountCode.length !== 6) continue;
        movements.push({
          businessId,
          pucCuentaCode: accountCode.length === 4 ? accountCode : undefined,
          pucSubcuentaId: accountCode.length === 6 ? accountCode : undefined,
          amount: this.money(line.amount),
          nature:
            mapping.side === PayrollAccountingSide.DEBIT
              ? MovementNature.DEBIT
              : MovementNature.CREDIT,
          date: new Date(),
          detail: `Liquidacion contrato ${employeeName} - ${line.name}`,
          originType: AccountingMovementOriginType.PAYROLL_SETTLEMENT,
          originId: settlement.id,
        });
      }
    }

    if (movements.length) {
      await tx.accountingMovement.createMany({ data: movements });
    }
  }

  async postContractSettlement(businessId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.payrollContractSettlement.findFirst({
        where: { id, businessId },
        include: { employee: true, contract: true, lines: true },
      });
      if (!settlement) throw new NotFoundException('Settlement not found');
      if (settlement.type !== PayrollSettlementType.REAL_TERMINATION) {
        throw new BadRequestException('Only real termination settlements can be posted');
      }
      if (settlement.status !== PayrollSettlementStatus.CALCULATED) {
        throw new BadRequestException('Only CALCULATED settlements can be posted');
      }
      if (settlement.postedAt) {
        throw new ConflictException('Settlement already posted');
      }

      await this.recreateSettlementAccountingMovements(
        businessId,
        settlement,
        tx,
      );

      const posted = await tx.payrollContractSettlement.update({
        where: { id },
        data: {
          status: PayrollSettlementStatus.POSTED,
          postedAt: new Date(),
        },
        include: { employee: true, contract: true, lines: true },
      });
      return this.withSettlementComputedFields(posted);
    });
  }
}
