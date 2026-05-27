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
  PayrollAccountingSide,
  PayrollAdjustmentType,
  PayrollConceptCategory,
  PayrollContractType,
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

type PayrollTx = Prisma.TransactionClient | PrismaService;

const EARNING_CODES_WITHOUT_CREDIT = new Set([
  'SALARY',
  'TRANSPORT_ALLOWANCE',
  'CONNECTIVITY_ALLOWANCE',
  'COMMISSIONS',
  'NON_SALARY_BONUS',
  'OVERTIME_TOTAL',
]);

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
        'salaryMonthly must be greater than or equal to configured SMMLV',
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
        email: this.normalizeNullableText(dto.email),
        phone: this.normalizeNullableText(dto.phone),
      },
    });
  }

  async deleteEmployee(businessId: string, id: string) {
    await this.assertEmployeeBelongsToBusiness(businessId, id);
    await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });
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
    return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
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

  private isLastDayOfMonth(date: Date) {
    const nextDay = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ));
    return nextDay.getUTCDate() === 1;
  }

  private dayForSettlement360(date: Date) {
    if (date.getUTCDate() === 31 || this.isLastDayOfMonth(date)) {
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

    return (
      (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
      (end.getUTCMonth() - start.getUTCMonth()) * 30 +
      (endDay - startDay) +
      1
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

    try {
      return await this.prisma.payrollPeriod.create({
        data: {
          businessId,
          year: dto.year,
          month: dto.month,
          paymentCycle: dto.paymentCycle,
          installmentNumber,
          status: PayrollPeriodStatus.OPEN,
        },
      });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Payroll period already exists');
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

    return this.prisma.payrollPeriod.update({
      where: { id },
      data: {
        status: dto.status,
        calculatedAt:
          dto.status === PayrollPeriodStatus.CALCULATED ? new Date() : undefined,
        postedAt: dto.status === PayrollPeriodStatus.POSTED ? new Date() : undefined,
        closedAt: dto.status === PayrollPeriodStatus.CLOSED ? new Date() : undefined,
      },
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
        where: { businessId, employeeId, isActive: true },
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
      const employerHealth = law1819Applies
        ? this.decimal(0)
        : ibcAmount.mul(params.healthEmployerRate);
      const employerPension = ibcAmount.mul(params.pensionEmployerRate);
      const employerArl = ibcAmount.mul(contract.arlRiskClass?.rate ?? 0);
      const compensationFund = ibcAmount.mul(params.compensationFundRate);
      const sena = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.senaRate);
      const icbf = law1819Applies ? this.decimal(0) : ibcAmount.mul(params.icbfRate);

      const benefitsBase = salaryEarned
        .add(transportAllowance)
        .add(connectivityAllowance)
        .add(commissions)
        .add(overtimeAmount);
      const severance = benefitsBase.mul(params.severanceRate);
      const severanceInterest = severance.mul(params.severanceInterestRate);
      const serviceBonus = benefitsBase.mul(params.serviceBonusRate);
      const vacation = salaryEarned.mul(params.vacationRate);
      const totalEmployerContributions = employerHealth
        .add(employerPension)
        .add(employerArl);
      const totalParafiscals = compensationFund.add(sena).add(icbf);
      const totalBenefits = severance
        .add(severanceInterest)
        .add(serviceBonus)
        .add(vacation);
      const realEmployerCost = grossIncome
        .add(totalEmployerContributions)
        .add(totalParafiscals)
        .add(totalBenefits);

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
          hourlyRate: hourlyRate.toString(),
          law1819Applies,
          arlRate: String(contract.arlRiskClass?.rate ?? 0),
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
        this.concept('SEVERANCE', 'Severance', PayrollConceptCategory.BENEFIT_PROVISION, severance, { baseAmount: benefitsBase, rate: params.severanceRate }),
        this.concept('SEVERANCE_INTEREST', 'Severance interest', PayrollConceptCategory.BENEFIT_PROVISION, severanceInterest, { baseAmount: severance, rate: params.severanceInterestRate }),
        this.concept('SERVICE_BONUS', 'Service bonus', PayrollConceptCategory.BENEFIT_PROVISION, serviceBonus, { baseAmount: benefitsBase, rate: params.serviceBonusRate }),
        this.concept('VACATION', 'Vacation', PayrollConceptCategory.BENEFIT_PROVISION, vacation, { baseAmount: salaryEarned, rate: params.vacationRate }),
      ].map((concept) => ({ ...concept, payrollRunId: run.id }));

      await tx.payrollConceptResult.createMany({ data: concepts });
      await this.recreateAccountingMovements(
        businessId,
        period,
        run,
        `${employee.firstName} ${employee.lastName}`,
        concepts,
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
    days: number,
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

  private async calculateSettlementValues(
    businessId: string,
    contract: Awaited<ReturnType<PayrollService['getContractForSettlement']>>,
    endDate: Date,
    tx: PayrollTx,
  ) {
    const startDate = this.startOfUtcDay(contract.startDate);
    const finalEndDate = this.startOfUtcDay(endDate);
    const totalWorkedDays = this.settlementDays360(startDate, finalEndDate);
    if (totalWorkedDays < 0) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const year = finalEndDate.getUTCFullYear();
    const semesterOneDays = this.settlementOverlapDays360(
      startDate,
      finalEndDate,
      new Date(Date.UTC(year, 0, 1)),
      new Date(Date.UTC(year, 5, 30)),
    );
    const semesterTwoDays = this.settlementOverlapDays360(
      startDate,
      finalEndDate,
      new Date(Date.UTC(year, 6, 1)),
      new Date(Date.UTC(year, 11, 31)),
    );

    const params = await this.resolvePayrollParameters(businessId, year, tx);
    const salaryMonthly = this.decimal(contract.salaryMonthly);
    const totalDays = this.decimal(totalWorkedDays);
    const dailySalary = salaryMonthly.div(params.maxWorkedDaysMonth);
    const hourlyRate = salaryMonthly.div(params.monthlyHours);
    const severance = salaryMonthly.mul(totalDays).div(360);
    const severanceInterest = severance.mul(0.12).mul(totalDays).div(360);
    const serviceBonusSemesterOne = salaryMonthly.mul(semesterOneDays).div(360);
    const serviceBonusSemesterTwo = salaryMonthly.mul(semesterTwoDays).div(360);
    const vacationDays = totalDays.mul(15).div(360);
    const vacation = salaryMonthly.mul(totalDays).div(720);
    const totalAmount = severance
      .add(severanceInterest)
      .add(serviceBonusSemesterOne)
      .add(serviceBonusSemesterTwo)
      .add(vacation);

    const snapshot = {
      ...this.parametersSnapshot(params),
      settlementYear: year,
      dailySalary: dailySalary.toString(),
      hourlyRate: hourlyRate.toString(),
      salaryMonthly: salaryMonthly.toString(),
      withholdingTax: '0',
      dayCountBasis: '30/360',
      formulas: {
        severance: 'salaryMonthly * totalWorkedDays30_360 / 360',
        severanceInterest: 'severance * 0.12 * totalWorkedDays30_360 / 360',
        serviceBonus: 'salaryMonthly * semesterDays30_360 / 360',
        vacationDays: 'totalWorkedDays30_360 * 15 / 360',
        vacation: 'salaryMonthly * totalWorkedDays30_360 / 720',
      },
    } as Prisma.InputJsonObject;

    const lines = [
      this.settlementLine(
        'SEVERANCE',
        'Cesantias',
        severance,
        salaryMonthly,
        totalWorkedDays,
        {
          basis: '30/360',
          formula: 'salaryMonthly * totalWorkedDays30_360 / 360',
        },
      ),
      this.settlementLine(
        'SEVERANCE_INTEREST',
        'Intereses cesantias',
        severanceInterest,
        severance,
        totalWorkedDays,
        {
          basis: '30/360',
          formula: 'severance * 0.12 * totalWorkedDays30_360 / 360',
        },
        new Prisma.Decimal(0.12),
      ),
      this.settlementLine(
        'SERVICE_BONUS_SEMESTER_ONE',
        'Prima de servicios I',
        serviceBonusSemesterOne,
        salaryMonthly,
        semesterOneDays,
        {
          basis: '30/360',
          formula: 'salaryMonthly * semesterOneDays30_360 / 360',
        },
      ),
      this.settlementLine(
        'SERVICE_BONUS_SEMESTER_TWO',
        'Prima de servicios II',
        serviceBonusSemesterTwo,
        salaryMonthly,
        semesterTwoDays,
        {
          basis: '30/360',
          formula: 'salaryMonthly * semesterTwoDays30_360 / 360',
        },
      ),
      this.settlementLine(
        'VACATION',
        'Vacaciones',
        vacation,
        salaryMonthly,
        totalWorkedDays,
        {
          basis: '30/360',
          formula: 'salaryMonthly * totalWorkedDays30_360 / 720',
          vacationDays: vacationDays.toDecimalPlaces(2).toString(),
        },
      ),
    ];

    return {
      startDate,
      endDate: finalEndDate,
      totalWorkedDays,
      semesterOneDays,
      semesterTwoDays,
      severance: this.money(severance),
      severanceInterest: this.money(severanceInterest),
      serviceBonusSemesterOne: this.money(serviceBonusSemesterOne),
      serviceBonusSemesterTwo: this.money(serviceBonusSemesterTwo),
      vacation: this.money(vacation),
      vacationDays: vacationDays.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      hourlyRate: this.money(hourlyRate),
      totalAmount: this.money(totalAmount),
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
    const endDate = dto.endDate
      ? this.parseDate(dto.endDate, 'endDate')
      : new Date();

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.createSettlement(
        businessId,
        contractId,
        PayrollSettlementType.SIMULATION_TO_DATE,
        endDate,
        tx,
      );
      return tx.payrollContractSettlement.findUnique({
        where: { id: settlement.id },
        include: { employee: true, contract: true, lines: true },
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

      return tx.payrollContractSettlement.findUnique({
        where: { id: settlement.id },
        include: { employee: true, contract: true, lines: true },
      });
    });
  }

  async listContractSettlements(
    businessId: string,
    query: QueryContractSettlementsDto,
  ) {
    return this.prisma.payrollContractSettlement.findMany({
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
  }

  async getContractSettlement(businessId: string, id: string) {
    const settlement = await this.prisma.payrollContractSettlement.findFirst({
      where: { id, businessId },
      include: { employee: true, contract: true, lines: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
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

      return tx.payrollContractSettlement.update({
        where: { id },
        data: {
          status: PayrollSettlementStatus.POSTED,
          postedAt: new Date(),
        },
        include: { employee: true, contract: true, lines: true },
      });
    });
  }
}
