import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  SimpleTaxPeriodStatus,
  SimpleTaxPeriodType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertSimpleTaxConfigDto } from './dto/simple-tax-config.dto';
import {
  SimpleTaxCalculateDto,
  SimpleTaxUpdatePeriodDto,
} from './dto/simple-tax-period.dto';

const ELECTRONIC_PAYMENTS_DISCOUNT_RATE = new Prisma.Decimal('0.005');

type CalculationInput = {
  taxYear: number;
  periodNumber: number;
  manualGrossIncome?: number | string | Prisma.Decimal | null;
  excludedIncome?: number | string | Prisma.Decimal | null;
  electronicPaymentsIncome?: number | string | Prisma.Decimal | null;
  pensionContributionsDiscount?: number | string | Prisma.Decimal | null;
  notes?: string | null;
};

type IncludedSale = {
  id: string;
  displayNumber: string | null;
  customerName: string | null;
  fiscalDate: string;
  subtotal: number;
  status: string;
};

@Injectable()
export class SimpleTaxService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(businessId: string) {
    const existing = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });

    return existing ?? {
      id: null,
      businessId,
      enabled: false,
      taxYear: new Date().getFullYear(),
      groupCode: null,
      activityLabel: null,
      ciiuCode: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  async upsertConfig(businessId: string, dto: UpsertSimpleTaxConfigDto) {
    return this.prisma.businessSimpleTaxConfig.upsert({
      where: { businessId },
      update: {
        enabled: dto.enabled,
        taxYear: dto.taxYear,
        groupCode: dto.groupCode?.trim() || null,
        activityLabel: dto.activityLabel?.trim() || null,
        ciiuCode: dto.ciiuCode?.trim() || null,
      },
      create: {
        businessId,
        enabled: dto.enabled,
        taxYear: dto.taxYear,
        groupCode: dto.groupCode?.trim() || null,
        activityLabel: dto.activityLabel?.trim() || null,
        ciiuCode: dto.ciiuCode?.trim() || null,
      },
    });
  }

  async listRates(taxYear: number, periodType: SimpleTaxPeriodType = SimpleTaxPeriodType.BIMONTHLY) {
    return this.prisma.simpleTaxRateBracket.findMany({
      where: { taxYear, periodType, active: true },
      orderBy: [{ groupCode: 'asc' }, { lowerUvt: 'asc' }],
    });
  }

  async listPeriods(businessId: string, taxYear: number) {
    return this.prisma.simpleTaxPeriod.findMany({
      where: { businessId, taxYear },
      orderBy: { periodNumber: 'asc' },
    });
  }

  async getPeriod(businessId: string, id: string) {
    const period = await this.prisma.simpleTaxPeriod.findFirst({
      where: { id, businessId },
    });
    if (!period) throw new NotFoundException('Periodo RST no encontrado');
    return period;
  }

  async calculateAndPersist(businessId: string, dto: SimpleTaxCalculateDto) {
    const calculation = await this.calculate(businessId, dto);
    const existing = await this.prisma.simpleTaxPeriod.findUnique({
      where: {
        businessId_taxYear_periodNumber: {
          businessId,
          taxYear: dto.taxYear,
          periodNumber: dto.periodNumber,
        },
      },
    });

    if (existing?.status === SimpleTaxPeriodStatus.POSTED) {
      throw new BadRequestException('El periodo RST ya esta cerrado.');
    }

    const period = await this.prisma.simpleTaxPeriod.upsert({
      where: {
        businessId_taxYear_periodNumber: {
          businessId,
          taxYear: dto.taxYear,
          periodNumber: dto.periodNumber,
        },
      },
      update: this.periodPersistenceData(calculation, SimpleTaxPeriodStatus.CALCULATED),
      create: {
        businessId,
        ...this.periodPersistenceData(calculation, SimpleTaxPeriodStatus.CALCULATED),
      },
    });

    return {
      id: period.id,
      status: period.status,
      ...calculation.response,
    };
  }

  async createPeriod(businessId: string, dto: SimpleTaxCalculateDto) {
    return this.calculateAndPersist(businessId, dto);
  }

  async updatePeriod(businessId: string, id: string, dto: SimpleTaxUpdatePeriodDto) {
    const existing = await this.getPeriod(businessId, id);
    if (existing.status === SimpleTaxPeriodStatus.POSTED) {
      throw new BadRequestException('El periodo RST ya esta cerrado.');
    }

    const calculation = await this.calculate(businessId, {
      taxYear: existing.taxYear,
      periodNumber: existing.periodNumber,
      manualGrossIncome: dto.manualGrossIncome ?? existing.manualGrossIncome,
      excludedIncome: dto.excludedIncome ?? existing.excludedIncome,
      electronicPaymentsIncome:
        dto.electronicPaymentsIncome ?? existing.electronicPaymentsIncome,
      pensionContributionsDiscount:
        dto.pensionContributionsDiscount ?? existing.pensionContributionsDiscount,
      notes: dto.notes ?? existing.notes,
    });

    const updated = await this.prisma.simpleTaxPeriod.update({
      where: { id: existing.id },
      data: this.periodPersistenceData(calculation, SimpleTaxPeriodStatus.CALCULATED),
    });

    return {
      id: updated.id,
      status: updated.status,
      ...calculation.response,
    };
  }

  async postPeriod(businessId: string, id: string) {
    const period = await this.getPeriod(businessId, id);
    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasSimpleResponsibility) {
      throw new BadRequestException(
        'El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.',
      );
    }

    return this.prisma.simpleTaxPeriod.update({
      where: { id: period.id },
      data: { status: SimpleTaxPeriodStatus.POSTED },
    });
  }

  async calculate(businessId: string, input: CalculationInput) {
    this.assertPeriodNumber(input.periodNumber);

    const config = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });
    if (!config?.enabled || !config.groupCode) {
      throw new BadRequestException('Configura el grupo del Regimen Simple antes de calcular.');
    }

    const globalParams = await this.prisma.taxGlobalParameter.findUnique({
      where: { year: input.taxYear },
    });
    if (!globalParams) {
      throw new BadRequestException(`No existe UVT configurada para ${input.taxYear}.`);
    }

    const periodRange = this.getBimonthlyRange(input.taxYear, input.periodNumber);
    const salesSummary = await this.calculateSalesGrossIncome(
      businessId,
      periodRange.start,
      periodRange.endExclusive,
    );
    const salesGrossIncome = salesSummary.total;
    const manualGrossIncome = this.toNonNegativeDecimal(input.manualGrossIncome);
    const excludedIncome = this.toNonNegativeDecimal(input.excludedIncome);
    const electronicPaymentsIncome = this.toNonNegativeDecimal(
      input.electronicPaymentsIncome,
    );
    const pensionContributionsDiscount = this.toNonNegativeDecimal(
      input.pensionContributionsDiscount,
    );

    const taxableGrossIncome = Prisma.Decimal.max(
      salesGrossIncome.add(manualGrossIncome).sub(excludedIncome),
      new Prisma.Decimal(0),
    );

    if (electronicPaymentsIncome.gt(taxableGrossIncome)) {
      throw new BadRequestException(
        'Los ingresos por pagos electronicos no pueden superar la base gravable.',
      );
    }

    const taxableGrossIncomeUvt = taxableGrossIncome.div(globalParams.uvt);
    const bracket = await this.findBracket(
      input.taxYear,
      config.groupCode,
      taxableGrossIncomeUvt,
    );
    const grossSimpleTax = taxableGrossIncome.mul(bracket.rate);
    const electronicPaymentsDiscount = electronicPaymentsIncome.mul(
      ELECTRONIC_PAYMENTS_DISCOUNT_RATE,
    );
    const totalDiscounts = electronicPaymentsDiscount.add(pensionContributionsDiscount);
    const netSimpleTax = Prisma.Decimal.max(
      grossSimpleTax.sub(totalDiscounts),
      new Prisma.Decimal(0),
    );
    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    const warnings = hasSimpleResponsibility
      ? []
      : ['El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.'];

    return {
      taxYear: input.taxYear,
      periodNumber: input.periodNumber,
      periodStart: this.formatDateOnly(periodRange.start),
      periodEnd: this.formatDateOnly(periodRange.end),
      periodStartDate: periodRange.start,
      periodEndDate: periodRange.end,
      salesGrossIncome,
      manualGrossIncome,
      excludedIncome,
      taxableGrossIncome,
      taxableGrossIncomeUvt,
      groupCode: config.groupCode,
      groupName: bracket.groupName,
      appliedRate: bracket.rate,
      grossSimpleTax,
      electronicPaymentsIncome,
      electronicPaymentsDiscount,
      pensionContributionsDiscount,
      totalDiscounts,
      netSimpleTax,
      bracket: {
        lowerUvt: bracket.lowerUvt,
        upperUvt: bracket.upperUvt,
        rate: bracket.rate,
      },
      uvtValue: globalParams.uvt,
      includedSales: salesSummary.includedSales,
      calculatedAt: new Date(),
      warnings,
      notes: input.notes ?? null,
      response: this.serializeCalculation({
        taxYear: input.taxYear,
        periodNumber: input.periodNumber,
        periodStart: this.formatDateOnly(periodRange.start),
        periodEnd: this.formatDateOnly(periodRange.end),
        uvtValue: globalParams.uvt,
        salesGrossIncome,
        manualGrossIncome,
        excludedIncome,
        taxableGrossIncome,
        taxableGrossIncomeUvt,
        groupCode: config.groupCode,
        groupName: bracket.groupName,
        appliedRate: bracket.rate,
        grossSimpleTax,
        electronicPaymentsIncome,
        electronicPaymentsDiscount,
        pensionContributionsDiscount,
        totalDiscounts,
        netSimpleTax,
        bracket: {
          lowerUvt: bracket.lowerUvt,
          upperUvt: bracket.upperUvt,
          rate: bracket.rate,
        },
        includedSales: salesSummary.includedSales,
        calculatedAt: new Date(),
        warnings,
      }),
    };
  }

  private async calculateSalesGrossIncome(
    businessId: string,
    start: Date,
    endExclusive: Date,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        businessId,
        status: OrderStatus.COMPLETED,
        archived: false,
        OR: [
          { accountingPostedAt: { gte: start, lt: endExclusive } },
          {
            accountingPostedAt: null,
            createdAt: { gte: start, lt: endExclusive },
          },
        ],
      },
      select: {
        id: true,
        documentNumber: true,
        customerName: true,
        status: true,
        accountingPostedAt: true,
        createdAt: true,
        total: true,
        fiscalContext: {
          select: {
            subtotal: true,
          },
        },
      },
    });

    let total = new Prisma.Decimal(0);
    const includedSales: IncludedSale[] = orders.map((order) => {
      const subtotal = order.fiscalContext?.subtotal ?? order.total;
      total = total.add(subtotal);
      const fiscalDate = this.getSimpleTaxSaleDate(order);

      return {
        id: order.id,
        displayNumber: order.documentNumber,
        customerName: order.customerName,
        fiscalDate: this.formatDateOnly(fiscalDate),
        subtotal: this.toNumber(subtotal),
        status: order.status,
      };
    });

    return { total, includedSales };
  }

  private getSimpleTaxSaleDate(order: {
    accountingPostedAt?: Date | null;
    createdAt: Date;
  }) {
    // RST usa fecha fiscal de cierre/posteo cuando existe; fallback a createdAt para ventas historicas.
    return order.accountingPostedAt ?? order.createdAt;
  }

  private async findBracket(taxYear: number, groupCode: string, baseUvt: Prisma.Decimal) {
    const brackets = await this.prisma.simpleTaxRateBracket.findMany({
      where: {
        taxYear,
        periodType: SimpleTaxPeriodType.BIMONTHLY,
        groupCode,
        active: true,
      },
      orderBy: { lowerUvt: 'asc' },
    });

    const bracket = brackets.find((candidate) => {
      const lowerMatches = baseUvt.gte(candidate.lowerUvt);
      const upperMatches = !candidate.upperUvt || baseUvt.lt(candidate.upperUvt);
      return lowerMatches && upperMatches;
    });

    if (!bracket) {
      throw new BadRequestException(
        `No existe tarifa RST para el grupo ${groupCode} y base ${baseUvt.toFixed(2)} UVT.`,
      );
    }

    return bracket;
  }

  private async businessHasSimpleResponsibility(businessId: string) {
    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      include: {
        responsibilities: {
          include: {
            responsibility: true,
          },
        },
      },
    });

    return Boolean(
      profile?.responsibilities.some((item) => item.responsibility.code === '47'),
    );
  }

  private periodPersistenceData(
    calculation: Awaited<ReturnType<SimpleTaxService['calculate']>>,
    status: SimpleTaxPeriodStatus,
  ) {
    return {
      taxYear: calculation.taxYear,
      periodNumber: calculation.periodNumber,
      periodStart: calculation.periodStartDate,
      periodEnd: calculation.periodEndDate,
      status,
      salesGrossIncome: calculation.salesGrossIncome,
      manualGrossIncome: calculation.manualGrossIncome,
      excludedIncome: calculation.excludedIncome,
      taxableGrossIncome: calculation.taxableGrossIncome,
      taxableGrossIncomeUvt: calculation.taxableGrossIncomeUvt,
      groupCode: calculation.groupCode,
      groupName: calculation.groupName,
      appliedRate: calculation.appliedRate,
      grossSimpleTax: calculation.grossSimpleTax,
      electronicPaymentsIncome: calculation.electronicPaymentsIncome,
      electronicPaymentsDiscount: calculation.electronicPaymentsDiscount,
      pensionContributionsDiscount: calculation.pensionContributionsDiscount,
      totalDiscounts: calculation.totalDiscounts,
      netSimpleTax: calculation.netSimpleTax,
      notes: calculation.notes,
      calculationSnapshot: calculation.response,
    };
  }

  private serializeCalculation(value: any) {
    return {
      taxYear: value.taxYear,
      periodNumber: value.periodNumber,
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
      uvtValue: this.toNumber(value.uvtValue),
      salesGrossIncome: this.toNumber(value.salesGrossIncome),
      manualGrossIncome: this.toNumber(value.manualGrossIncome),
      excludedIncome: this.toNumber(value.excludedIncome),
      taxableGrossIncome: this.toNumber(value.taxableGrossIncome),
      taxableGrossIncomeUvt: this.toNumber(
        value.taxableGrossIncomeUvt.toDecimalPlaces(2),
      ),
      groupCode: value.groupCode,
      groupName: value.groupName,
      appliedRate: this.toRateNumber(value.appliedRate),
      grossSimpleTax: this.toNumber(value.grossSimpleTax),
      electronicPaymentsIncome: this.toNumber(value.electronicPaymentsIncome),
      electronicPaymentsDiscount: this.toNumber(value.electronicPaymentsDiscount),
      pensionContributionsDiscount: this.toNumber(value.pensionContributionsDiscount),
      totalDiscounts: this.toNumber(value.totalDiscounts),
      netSimpleTax: this.toNumber(value.netSimpleTax),
      bracket: {
        lowerUvt: this.toNumber(value.bracket.lowerUvt),
        upperUvt: value.bracket.upperUvt ? this.toNumber(value.bracket.upperUvt) : null,
        rate: this.toRateNumber(value.bracket.rate),
      },
      includedSales: value.includedSales ?? [],
      calculatedAt:
        value.calculatedAt instanceof Date
          ? value.calculatedAt.toISOString()
          : value.calculatedAt,
      warnings: value.warnings ?? [],
    };
  }

  private getBimonthlyRange(taxYear: number, periodNumber: number) {
    this.assertPeriodNumber(periodNumber);
    const startMonth = (periodNumber - 1) * 2;
    const start = new Date(Date.UTC(taxYear, startMonth, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(taxYear, startMonth + 2, 1, 0, 0, 0, 0));
    const end = new Date(endExclusive.getTime() - 1);
    return { start, end, endExclusive };
  }

  private assertPeriodNumber(periodNumber: number) {
    if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 6) {
      throw new BadRequestException('periodNumber debe estar entre 1 y 6.');
    }
  }

  private toNonNegativeDecimal(value: unknown) {
    if (value === undefined || value === null || value === '') return new Prisma.Decimal(0);
    const decimal = new Prisma.Decimal(value as any);
    if (decimal.lt(0)) {
      throw new BadRequestException('Los valores del calculo RST no pueden ser negativos.');
    }
    return decimal;
  }

  private toNumber(value: Prisma.Decimal) {
    return Number(value.toDecimalPlaces(2).toString());
  }

  private toRateNumber(value: Prisma.Decimal) {
    return Number(value.toDecimalPlaces(6).toString());
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
