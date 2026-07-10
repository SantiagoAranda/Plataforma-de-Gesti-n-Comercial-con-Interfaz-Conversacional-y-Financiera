import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountingMovementOriginType,
  MovementNature,
  OrderStatus,
  Prisma,
  SimpleTaxFilingMode,
  SimpleTaxPeriodStatus,
  SimpleTaxPeriodType,
  SimpleTaxAnnualReturnStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertSimpleTaxConfigDto } from './dto/simple-tax-config.dto';
import {
  SimpleTaxCalculateDto,
  SimpleTaxPayPeriodDto,
  SimpleTaxPaymentMethod,
  SimpleTaxUpdatePeriodDto,
} from './dto/simple-tax-period.dto';
import {
  CalculateSimpleTaxAnnualReturnDto,
  PaySimpleTaxAnnualReturnDto,
} from './dto/simple-tax-annual.dto';

const ELECTRONIC_PAYMENTS_DISCOUNT_RATE = new Prisma.Decimal('0.005');
const SIMPLE_TAX_EXPENSE_PUC_CODE = '519595';
const SIMPLE_TAX_PAYABLE_PUC_CODE = '219595';
const SIMPLE_TAX_CASH_PUC_CODE = '110505';
const SIMPLE_TAX_BANK_PUC_CODE = '111005';

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

type SimpleTaxGroupResolution =
  | {
      status: 'RESOLVED';
      groupCode: string;
      groupName: string | null;
      ciiuCode: string;
      ciiuDescription: string | null;
      source: string;
    }
  | {
      status: 'NO_RUT_ACTIVITY' | 'NOT_FOUND';
      groupCode: null;
      groupName: null;
      ciiuCode: string | null;
      ciiuDescription: string | null;
      source: null;
    }
  | {
      status: 'AMBIGUOUS';
      groupCode: null;
      groupName: null;
      ciiuCode: string;
      ciiuDescription: string | null;
      source: string;
      candidates: Array<{ groupCode: string; groupName: string | null }>;
    };

type SimpleTaxActivityGroupMappingRow = {
  id: string;
  taxYear: number;
  ciiuCode: string;
  groupCode: string;
  groupName: string | null;
  source: string;
  active: boolean;
  createdAt: Date;
};

@Injectable()
export class SimpleTaxService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(businessId: string) {
    const existing = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });

    const baseConfig = existing ?? {
      id: null,
      businessId,
      enabled: false,
      taxYear: new Date().getFullYear(),
      groupCode: null,
      activityLabel: null,
      ciiuCode: null,
      filingMode: SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
      createdAt: null,
      updatedAt: null,
    };

    const rutContext = await this.getSimpleTaxRutContext(
      businessId,
      baseConfig.taxYear,
    );

    return {
      ...baseConfig,
      rutActivity: rutContext.rutActivity,
      hasSimpleTaxResponsibility: rutContext.hasSimpleTaxResponsibility,
      groupResolution: rutContext.groupResolution,
    };
  }

  async upsertConfig(businessId: string, dto: UpsertSimpleTaxConfigDto) {
    const updateData: Prisma.BusinessSimpleTaxConfigUpdateInput = {
      enabled: dto.enabled,
      taxYear: dto.taxYear,
      groupCode: dto.groupCode?.trim() || null,
      activityLabel: dto.activityLabel?.trim() || null,
      ciiuCode: dto.ciiuCode?.trim() || null,
    };
    if (dto.filingMode !== undefined) {
      updateData.filingMode = dto.filingMode;
    }

    return this.prisma.businessSimpleTaxConfig.upsert({
      where: { businessId },
      update: updateData,
      create: {
        businessId,
        enabled: dto.enabled,
        taxYear: dto.taxYear,
        groupCode: dto.groupCode?.trim() || null,
        activityLabel: dto.activityLabel?.trim() || null,
        ciiuCode: dto.ciiuCode?.trim() || null,
        filingMode: dto.filingMode ?? SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
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
    await this.assertTaxSettingsEnabled(businessId);
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

    if (
      existing?.status === SimpleTaxPeriodStatus.POSTED ||
      existing?.status === SimpleTaxPeriodStatus.PAID
    ) {
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
    await this.assertTaxSettingsEnabled(businessId);
    const existing = await this.getPeriod(businessId, id);
    if (
      existing.status === SimpleTaxPeriodStatus.POSTED ||
      existing.status === SimpleTaxPeriodStatus.PAID
    ) {
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
    await this.assertTaxSettingsEnabled(businessId);
    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasSimpleResponsibility) {
      throw new BadRequestException(
        'El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.',
      );
    }
    await this.assertBimonthlyFilingMode(businessId);

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.simpleTaxPeriod.findFirst({
        where: { id, businessId },
      });
      if (!period) throw new NotFoundException('Periodo RST no encontrado');

      await this.assertResolvedSimpleTaxGroup(
        businessId,
        period.taxYear,
        'presentar',
      );

      if (
        period.status === SimpleTaxPeriodStatus.POSTED ||
        period.status === SimpleTaxPeriodStatus.PAID
      ) {
        return period;
      }

      if (period.status !== SimpleTaxPeriodStatus.CALCULATED) {
        throw new BadRequestException('Solo se pueden presentar periodos calculados.');
      }

      const netSimpleTax = new Prisma.Decimal(period.netSimpleTax);
      if (netSimpleTax.lt(0)) {
        throw new BadRequestException('El impuesto neto RST no puede ser negativo.');
      }

      const accountingEntryId = `simple-tax-post-${period.id}`;
      const now = new Date();

      if (netSimpleTax.gt(0)) {
        await this.assertSimpleTaxPucAccounts(tx, [
          SIMPLE_TAX_EXPENSE_PUC_CODE,
          SIMPLE_TAX_PAYABLE_PUC_CODE,
        ]);

        const existingMovements = await tx.accountingMovement.count({
          where: {
            businessId,
            originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
            originId: period.id,
            metadata: {
              path: ['kind'],
              equals: 'POST',
            },
          },
        });

        if (existingMovements === 0) {
          const detail = `Régimen Simple ${period.taxYear} bimestre ${period.periodNumber}`;
          await tx.accountingMovement.createMany({
            data: [
              {
                businessId,
                pucSubcuentaId: SIMPLE_TAX_EXPENSE_PUC_CODE,
                amount: netSimpleTax,
                nature: MovementNature.DEBIT,
                date: period.periodEnd,
                detail: `${detail} - Otro - Gasto Impuesto régimen simple`,
                originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
                originId: period.id,
                metadata: {
                  periodId: period.id,
                  kind: 'POST',
                  taxYear: period.taxYear,
                  periodNumber: period.periodNumber,
                },
              },
              {
                businessId,
                pucSubcuentaId: SIMPLE_TAX_PAYABLE_PUC_CODE,
                amount: netSimpleTax,
                nature: MovementNature.CREDIT,
                date: period.periodEnd,
                detail: `${detail} - Otro - Impuesto simple por pagar`,
                originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
                originId: period.id,
                metadata: {
                  periodId: period.id,
                  kind: 'POST',
                  taxYear: period.taxYear,
                  periodNumber: period.periodNumber,
                },
              },
            ],
          });
        }
      }

      return tx.simpleTaxPeriod.update({
        where: { id: period.id },
        data: {
          status: SimpleTaxPeriodStatus.POSTED,
          postedAt: now,
          accountingEntryId: netSimpleTax.gt(0) ? accountingEntryId : null,
        },
      });
    });
  }

  async payPeriod(businessId: string, id: string, dto: SimpleTaxPayPeriodDto) {
    await this.assertTaxSettingsEnabled(businessId);
    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasSimpleResponsibility) {
      throw new BadRequestException(
        'El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.',
      );
    }
    await this.assertBimonthlyFilingMode(businessId);

    return this.prisma.$transaction(async (tx) => {
      const period = await tx.simpleTaxPeriod.findFirst({
        where: { id, businessId },
      });
      if (!period) throw new NotFoundException('Periodo RST no encontrado');

      await this.assertResolvedSimpleTaxGroup(
        businessId,
        period.taxYear,
        'pagar',
      );

      if (period.status === SimpleTaxPeriodStatus.CALCULATED) {
        throw new BadRequestException('El periodo RST debe estar presentado antes de pagar.');
      }
      if (period.status === SimpleTaxPeriodStatus.PAID) {
        throw new BadRequestException('El periodo RST ya fue pagado.');
      }
      if (period.status !== SimpleTaxPeriodStatus.POSTED) {
        throw new BadRequestException('El periodo RST no esta listo para pago.');
      }

      const netSimpleTax = new Prisma.Decimal(period.netSimpleTax).toDecimalPlaces(2);
      if (netSimpleTax.lte(0)) {
        throw new BadRequestException('Los periodos con impuesto cero no requieren pago.');
      }

      const paidAmount = new Prisma.Decimal(dto.paidAmount).toDecimalPlaces(2);
      if (!paidAmount.eq(netSimpleTax)) {
        throw new BadRequestException('Solo se permite pago total del impuesto RST.');
      }

      const paymentAccountCode =
        dto.paymentMethod === SimpleTaxPaymentMethod.CASH
          ? SIMPLE_TAX_CASH_PUC_CODE
          : dto.paymentAccountCode || SIMPLE_TAX_BANK_PUC_CODE;

      if (
        dto.paymentMethod === SimpleTaxPaymentMethod.BANK &&
        paymentAccountCode !== SIMPLE_TAX_BANK_PUC_CODE
      ) {
        throw new BadRequestException('La cuenta bancaria permitida es 111005.');
      }

      await this.assertSimpleTaxPucAccounts(tx, [
        SIMPLE_TAX_PAYABLE_PUC_CODE,
        paymentAccountCode,
      ]);

      const paymentDate = new Date(dto.paymentDate);
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException('Fecha de pago invalida.');
      }

      const paidAccountingEntryId = `simple-tax-pay-${period.id}`;
      const existingMovements = await tx.accountingMovement.count({
        where: {
          businessId,
          originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
          originId: period.id,
          metadata: {
            path: ['kind'],
            equals: 'PAY',
          },
        },
      });

      if (existingMovements > 0) {
        throw new BadRequestException('El pago RST ya tiene movimientos contables.');
      }

      const detail = `Pago Régimen Simple ${period.taxYear} bimestre ${period.periodNumber}`;
      await tx.accountingMovement.createMany({
        data: [
          {
            businessId,
            pucSubcuentaId: SIMPLE_TAX_PAYABLE_PUC_CODE,
            amount: paidAmount,
            nature: MovementNature.DEBIT,
            date: paymentDate,
            detail: `${detail} - Otro - Impuesto simple por pagar`,
            originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
            originId: period.id,
            metadata: {
              periodId: period.id,
              kind: 'PAY',
              taxYear: period.taxYear,
              periodNumber: period.periodNumber,
              paymentAccountCode,
            },
          },
          {
            businessId,
            pucSubcuentaId: paymentAccountCode,
            amount: paidAmount,
            nature: MovementNature.CREDIT,
            date: paymentDate,
            detail:
              dto.paymentMethod === SimpleTaxPaymentMethod.CASH
                ? 'Pago Régimen Simple en efectivo'
                : 'Pago Régimen Simple por banco',
            originType: AccountingMovementOriginType.SIMPLE_TAX_PERIOD,
            originId: period.id,
            metadata: {
              periodId: period.id,
              kind: 'PAY',
              taxYear: period.taxYear,
              periodNumber: period.periodNumber,
              paymentMethod: dto.paymentMethod,
              paymentAccountCode,
              notes: dto.notes ?? null,
            },
          },
        ],
      });

      return tx.simpleTaxPeriod.update({
        where: { id: period.id },
        data: {
          status: SimpleTaxPeriodStatus.PAID,
          paidAt: paymentDate,
          paidAmount,
          paymentAccountCode,
          paidAccountingEntryId,
        },
      });
    });
  }

  async calculate(businessId: string, input: CalculationInput) {
    this.assertPeriodNumber(input.periodNumber);

    const config = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });
    if (!config?.enabled) {
      throw new BadRequestException(
        'Activa la responsabilidad 47 - Regimen Simple en el RUT antes de calcular.',
      );
    }

    const hasSimpleResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasSimpleResponsibility) {
      throw new BadRequestException(
        'El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.',
      );
    }

    const groupResolution = await this.assertResolvedSimpleTaxGroup(
      businessId,
      input.taxYear,
      'calcular',
    );

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
      groupResolution.groupCode,
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
    const filingMode = config.filingMode ?? SimpleTaxFilingMode.BIMONTHLY_ADVANCE;
    const warnings: string[] = [];
    if (filingMode === SimpleTaxFilingMode.ANNUAL_EXCEPTION) {
      warnings.push(
        'Este negocio esta configurado con modalidad anual. El bimestre es informativo y no genera presentacion ni asiento contable.',
      );
    }
    const informativeOnly = filingMode === SimpleTaxFilingMode.ANNUAL_EXCEPTION;

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
      groupCode: groupResolution.groupCode,
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
      filingMode,
      informativeOnly,
      groupResolution,
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
        groupCode: groupResolution.groupCode,
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
        filingMode,
        informativeOnly,
        groupResolution,
      }),
    };
  }

  async resolveSimpleTaxGroupFromRut(
    businessId: string,
    taxYear: number,
  ): Promise<SimpleTaxGroupResolution> {
    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      select: {
        mainCiiuCode: true,
        mainCiiuDescription: true,
      },
    });

    const ciiuCode = profile?.mainCiiuCode?.trim() || null;
    const ciiuDescription = await this.resolveCiiuDescription(
      ciiuCode,
      profile?.mainCiiuDescription,
    );

    if (!ciiuCode) {
      return {
        status: 'NO_RUT_ACTIVITY',
        groupCode: null,
        groupName: null,
        ciiuCode: null,
        ciiuDescription,
        source: null,
      };
    }

    const mappings = await this.prisma.$queryRaw<SimpleTaxActivityGroupMappingRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "taxYear",
          "ciiuCode",
          "groupCode",
          "groupName",
          "source",
          "active",
          "createdAt"
        FROM "SimpleTaxActivityGroupMapping"
        WHERE "taxYear" = ${taxYear}
          AND "ciiuCode" = ${ciiuCode}
          AND "active" = true
        ORDER BY "groupCode" ASC, "createdAt" ASC
      `,
    );

    if (mappings.length === 0) {
      return {
        status: 'NOT_FOUND',
        groupCode: null,
        groupName: null,
        ciiuCode,
        ciiuDescription,
        source: null,
      };
    }

    const groups = new Map<string, string | null>();
    for (const mapping of mappings) {
      groups.set(mapping.groupCode, mapping.groupName);
    }

    if (groups.size > 1) {
      return {
        status: 'AMBIGUOUS',
        groupCode: null,
        groupName: null,
        ciiuCode,
        ciiuDescription,
        source: mappings[0].source,
        candidates: [...groups.entries()].map(([groupCode, groupName]) => ({
          groupCode,
          groupName,
        })),
      };
    }

    const [groupCode, groupName] = [...groups.entries()][0];
    return {
      status: 'RESOLVED',
      groupCode,
      groupName,
      ciiuCode,
      ciiuDescription,
      source: mappings[0].source,
    };
  }

  private async resolveCiiuDescription(
    ciiuCode: string | null,
    rutDescription?: string | null,
  ) {
    const trimmedRutDescription = rutDescription?.trim();
    if (trimmedRutDescription) return trimmedRutDescription;
    if (!ciiuCode) return null;

    const catalogActivity = await this.prisma.economicActivityCiiu.findUnique({
      where: { code: ciiuCode },
      select: { description: true },
    });

    return catalogActivity?.description ?? null;
  }

  private async getSimpleTaxRutContext(businessId: string, taxYear: number) {
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

    const hasSimpleTaxResponsibility = Boolean(
      profile?.responsibilities.some((item) => item.responsibility.code === '47'),
    );
    const groupResolution = await this.resolveSimpleTaxGroupFromRut(businessId, taxYear);

    const ciiuCode = profile?.mainCiiuCode ?? null;

    return {
      rutActivity: {
        ciiuCode,
        ciiuDescription: await this.resolveCiiuDescription(
          ciiuCode,
          profile?.mainCiiuDescription,
        ),
      },
      hasSimpleTaxResponsibility,
      groupResolution,
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

  private async assertBimonthlyFilingMode(businessId: string) {
    const config = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
      select: { filingMode: true },
    });

    if (config?.filingMode === SimpleTaxFilingMode.ANNUAL_EXCEPTION) {
      throw new BadRequestException(
        'Este negocio esta configurado con excepcion anual. El bimestre es informativo y no genera presentacion, pago ni asiento contable.',
      );
    }
  }

  private async assertResolvedSimpleTaxGroup(
    businessId: string,
    taxYear: number,
    action: 'calcular' | 'presentar' | 'pagar',
  ) {
    const groupResolution = await this.resolveSimpleTaxGroupFromRut(
      businessId,
      taxYear,
    );

    if (groupResolution.status === 'RESOLVED') return groupResolution;

    if (groupResolution.status === 'NO_RUT_ACTIVITY') {
      throw new BadRequestException('No hay actividad economica configurada en el RUT.');
    }

    if (action === 'presentar') {
      throw new BadRequestException(
        'No se puede presentar el impuesto porque el grupo RST no esta resuelto para la actividad economica actual.',
      );
    }

    if (action === 'pagar') {
      throw new BadRequestException(
        'No se puede pagar el impuesto porque el grupo RST no esta resuelto para la actividad economica actual.',
      );
    }

    if (groupResolution.status === 'NOT_FOUND') {
      throw new BadRequestException(
        'No se pudo determinar el grupo RST para la actividad economica del RUT.',
      );
    }

    throw new BadRequestException(
      'La actividad economica tiene mas de un grupo RST posible. Requiere revision.',
    );
  }

  private async assertSimpleTaxPucAccounts(
    tx: Prisma.TransactionClient,
    codes: string[],
  ) {
    const accounts = await tx.pucSubcuenta.findMany({
      where: { code: { in: codes }, active: true },
      select: { code: true },
    });
    const foundCodes = new Set(accounts.map((account) => account.code));
    const missing = codes.filter((code) => !foundCodes.has(code));
    if (missing.length > 0) {
      throw new BadRequestException(`Cuentas PUC RST no configuradas: ${missing.join(', ')}`);
    }
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
      filingMode: value.filingMode ?? SimpleTaxFilingMode.BIMONTHLY_ADVANCE,
      informativeOnly: Boolean(value.informativeOnly),
      groupResolution: value.groupResolution ?? null,
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

  async calculateAnnualReturn(businessId: string, taxYear: number, payload: CalculateSimpleTaxAnnualReturnDto) {
    await this.assertTaxSettingsEnabled(businessId);
    const config = await this.prisma.businessSimpleTaxConfig.findUnique({
      where: { businessId },
    });
    if (!config?.enabled || !config.groupCode) {
      throw new BadRequestException('Configura el grupo del Regimen Simple antes de calcular.');
    }

    const hasResponsibility = await this.businessHasSimpleResponsibility(businessId);
    if (!hasResponsibility) {
      throw new BadRequestException('El negocio no tiene la responsabilidad 47 - Regimen Simple configurada.');
    }

    // Verify annual brackets exist for the year
    const annualBrackets = await this.prisma.simpleTaxRateBracket.findMany({
      where: {
        taxYear,
        periodType: SimpleTaxPeriodType.ANNUAL,
        groupCode: config.groupCode,
        active: true,
      },
    });

    if (annualBrackets.length === 0) {
      throw new BadRequestException('Falta parametrizar tabla anual RST para este año fiscal.');
    }

    const globalParams = await this.prisma.taxGlobalParameter.findUnique({
      where: { year: taxYear },
    });
    if (!globalParams) {
      throw new BadRequestException(`No existe UVT configurada para ${taxYear}.`);
    }

    const start = new Date(Date.UTC(taxYear, 0, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(taxYear + 1, 0, 1, 0, 0, 0, 0));
    const salesSummary = await this.calculateSalesGrossIncome(businessId, start, endExclusive);

    const grossIncome = salesSummary.total;
    const manualGrossIncome = this.toNonNegativeDecimal(payload.manualGrossIncome);
    const excludedIncome = this.toNonNegativeDecimal(payload.excludedIncome);
    const electronicPaymentsIncome = this.toNonNegativeDecimal(payload.electronicPaymentsIncome);
    const pensionContributionsDiscount = this.toNonNegativeDecimal(payload.pensionContributionsDiscount);

    const taxableGrossIncome = Prisma.Decimal.max(
      grossIncome.add(manualGrossIncome).sub(excludedIncome),
      new Prisma.Decimal(0),
    );

    if (electronicPaymentsIncome.gt(taxableGrossIncome)) {
      throw new BadRequestException(
        'Los ingresos por pagos electronicos no pueden superar la base gravable.',
      );
    }

    const taxableGrossIncomeUvt = taxableGrossIncome.div(globalParams.uvt);

    const bracket = annualBrackets.find((candidate) => {
      const lowerMatches = taxableGrossIncomeUvt.gte(candidate.lowerUvt);
      const upperMatches = !candidate.upperUvt || taxableGrossIncomeUvt.lt(candidate.upperUvt);
      return lowerMatches && upperMatches;
    });

    if (!bracket) {
      throw new BadRequestException(
        `No existe tarifa RST anual para el grupo ${config.groupCode} y base ${taxableGrossIncomeUvt.toFixed(2)} UVT.`,
      );
    }

    const grossSimpleTax = taxableGrossIncome.mul(bracket.rate);
    const electronicPaymentsDiscount = electronicPaymentsIncome.mul(ELECTRONIC_PAYMENTS_DISCOUNT_RATE);
    const totalDiscounts = electronicPaymentsDiscount.add(pensionContributionsDiscount);
    const netAnnualTax = Prisma.Decimal.max(grossSimpleTax.sub(totalDiscounts), new Prisma.Decimal(0));

    // Sum netSimpleTax from bimonthly periods of the same year with status POSTED or PAID
    const bimonthlyPeriods = await this.prisma.simpleTaxPeriod.findMany({
      where: {
        businessId,
        taxYear,
        status: { in: [SimpleTaxPeriodStatus.POSTED, SimpleTaxPeriodStatus.PAID] },
      },
    });

    const bimonthlyAdvancesTotal = bimonthlyPeriods.reduce(
      (sum, p) => sum.add(p.netSimpleTax),
      new Prisma.Decimal(0),
    );

    const balanceDue = Prisma.Decimal.max(netAnnualTax.sub(bimonthlyAdvancesTotal), new Prisma.Decimal(0));
    const balanceInFavor = Prisma.Decimal.max(bimonthlyAdvancesTotal.sub(netAnnualTax), new Prisma.Decimal(0));

    const existing = await this.prisma.simpleTaxAnnualReturn.findUnique({
      where: { businessId_taxYear: { businessId, taxYear } },
    });
    if (existing && existing.status !== SimpleTaxAnnualReturnStatus.CALCULATED) {
      throw new BadRequestException('La declaracion anual RST ya esta presentada o pagada.');
    }

    const snapshot = {
      taxYear,
      salesGrossIncome: this.toNumber(grossIncome),
      manualGrossIncome: this.toNumber(manualGrossIncome),
      excludedIncome: this.toNumber(excludedIncome),
      taxableGrossIncome: this.toNumber(taxableGrossIncome),
      taxableGrossIncomeUvt: Number(taxableGrossIncomeUvt.toFixed(4)),
      groupCode: config.groupCode,
      groupName: bracket.groupName,
      appliedRate: this.toRateNumber(bracket.rate),
      grossSimpleTax: this.toNumber(grossSimpleTax),
      electronicPaymentsIncome: this.toNumber(electronicPaymentsIncome),
      electronicPaymentsDiscount: this.toNumber(electronicPaymentsDiscount),
      pensionContributionsDiscount: this.toNumber(pensionContributionsDiscount),
      totalDiscounts: this.toNumber(totalDiscounts),
      bimonthlyAdvancesTotal: this.toNumber(bimonthlyAdvancesTotal),
      netAnnualTax: this.toNumber(netAnnualTax),
      balanceDue: this.toNumber(balanceDue),
      balanceInFavor: this.toNumber(balanceInFavor),
      bracket: {
        lowerUvt: this.toNumber(bracket.lowerUvt),
        upperUvt: bracket.upperUvt ? this.toNumber(bracket.upperUvt) : null,
        rate: this.toRateNumber(bracket.rate),
      },
      uvtValue: this.toNumber(globalParams.uvt),
      includedSales: salesSummary.includedSales,
      includedPeriods: bimonthlyPeriods.map((p) => ({
        id: p.id,
        periodNumber: p.periodNumber,
        netSimpleTax: this.toNumber(p.netSimpleTax),
        status: p.status,
      })),
      calculatedAt: new Date().toISOString(),
    };

    const returnData = {
      businessId,
      taxYear,
      status: SimpleTaxAnnualReturnStatus.CALCULATED,
      filingMode: config.filingMode,
      groupCode: config.groupCode,
      groupName: bracket.groupName,
      grossIncome,
      manualGrossIncome,
      excludedIncome,
      taxableGrossIncome,
      taxableGrossIncomeUvt,
      grossSimpleTax,
      electronicPaymentsIncome,
      electronicPaymentsDiscount,
      pensionContributionsDiscount,
      totalDiscounts,
      bimonthlyAdvancesTotal,
      netAnnualTax,
      balanceDue,
      balanceInFavor,
      calculationSnapshot: snapshot as any,
    };

    return this.prisma.simpleTaxAnnualReturn.upsert({
      where: { businessId_taxYear: { businessId, taxYear } },
      update: returnData,
      create: returnData,
    });
  }

  async getAnnualReturn(businessId: string, taxYear: number) {
    return this.prisma.simpleTaxAnnualReturn.findUnique({
      where: { businessId_taxYear: { businessId, taxYear } },
    });
  }

  async listAnnualReturns(businessId: string) {
    return this.prisma.simpleTaxAnnualReturn.findMany({
      where: { businessId },
      orderBy: { taxYear: 'desc' },
    });
  }

  async postAnnualReturn(businessId: string, id: string) {
    await this.assertTaxSettingsEnabled(businessId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const annualReturn = await tx.simpleTaxAnnualReturn.findFirst({
        where: { id, businessId },
      });
      if (!annualReturn) throw new NotFoundException('Declaracion anual RST no encontrada.');

      if (annualReturn.status !== SimpleTaxAnnualReturnStatus.CALCULATED) {
        throw new BadRequestException('La declaracion anual RST ya esta presentada.');
      }

      const balanceDue = new Prisma.Decimal(annualReturn.balanceDue).toDecimalPlaces(2);
      const accountingEntryId = `simple-tax-annual-post-${annualReturn.id}`;

      if (balanceDue.gt(0)) {
        await this.assertSimpleTaxPucAccounts(tx, [
          SIMPLE_TAX_EXPENSE_PUC_CODE,
          SIMPLE_TAX_PAYABLE_PUC_CODE,
        ]);

        const detail = `Declaración anual Régimen Simple ${annualReturn.taxYear}`;
        await tx.accountingMovement.createMany({
          data: [
            {
              businessId,
              pucSubcuentaId: SIMPLE_TAX_EXPENSE_PUC_CODE,
              amount: balanceDue,
              nature: MovementNature.DEBIT,
              date: new Date(Date.UTC(annualReturn.taxYear, 11, 31, 23, 59, 59, 999)),
              detail: `${detail} - Gasto Impuesto régimen simple`,
              originType: AccountingMovementOriginType.SIMPLE_TAX_ANNUAL_RETURN,
              originId: annualReturn.id,
              metadata: {
                annualReturnId: annualReturn.id,
                kind: 'POST',
                taxYear: annualReturn.taxYear,
              },
            },
            {
              businessId,
              pucSubcuentaId: SIMPLE_TAX_PAYABLE_PUC_CODE,
              amount: balanceDue,
              nature: MovementNature.CREDIT,
              date: new Date(Date.UTC(annualReturn.taxYear, 11, 31, 23, 59, 59, 999)),
              detail: `${detail} - Impuesto simple por pagar`,
              originType: AccountingMovementOriginType.SIMPLE_TAX_ANNUAL_RETURN,
              originId: annualReturn.id,
              metadata: {
                annualReturnId: annualReturn.id,
                kind: 'POST',
                taxYear: annualReturn.taxYear,
              },
            },
          ],
        });
      }

      return tx.simpleTaxAnnualReturn.update({
        where: { id: annualReturn.id },
        data: {
          status: SimpleTaxAnnualReturnStatus.POSTED,
          postedAt: now,
          accountingEntryId: balanceDue.gt(0) ? accountingEntryId : null,
        },
      });
    });
  }

  async payAnnualReturn(businessId: string, id: string, dto: PaySimpleTaxAnnualReturnDto) {
    await this.assertTaxSettingsEnabled(businessId);
    return this.prisma.$transaction(async (tx) => {
      const annualReturn = await tx.simpleTaxAnnualReturn.findFirst({
        where: { id, businessId },
      });
      if (!annualReturn) throw new NotFoundException('Declaracion anual RST no encontrada.');

      if (annualReturn.status === SimpleTaxAnnualReturnStatus.CALCULATED) {
        throw new BadRequestException('La declaracion anual RST debe estar presentada antes de pagar.');
      }
      if (annualReturn.status === SimpleTaxAnnualReturnStatus.PAID) {
        throw new BadRequestException('La declaracion anual RST ya fue pagada.');
      }

      const balanceDue = new Prisma.Decimal(annualReturn.balanceDue).toDecimalPlaces(2);
      if (balanceDue.lte(0)) {
        throw new BadRequestException('Las declaraciones con saldo a pagar cero no requieren pago.');
      }

      const paidAmount = new Prisma.Decimal(dto.paidAmount).toDecimalPlaces(2);
      if (!paidAmount.eq(balanceDue)) {
        throw new BadRequestException('Solo se permite pago total del impuesto RST.');
      }

      const paymentAccountCode =
        dto.paymentMethod === SimpleTaxPaymentMethod.CASH
          ? SIMPLE_TAX_CASH_PUC_CODE
          : dto.paymentAccountCode || SIMPLE_TAX_BANK_PUC_CODE;

      if (
        dto.paymentMethod === SimpleTaxPaymentMethod.BANK &&
        paymentAccountCode !== SIMPLE_TAX_BANK_PUC_CODE
      ) {
        throw new BadRequestException('La cuenta bancaria permitida es 111005.');
      }

      await this.assertSimpleTaxPucAccounts(tx, [
        SIMPLE_TAX_PAYABLE_PUC_CODE,
        paymentAccountCode,
      ]);

      const paymentDate = new Date(dto.paymentDate);
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException('Fecha de pago invalida.');
      }

      const paidAccountingEntryId = `simple-tax-annual-pay-${annualReturn.id}`;

      const existingMovements = await tx.accountingMovement.count({
        where: {
          businessId,
          originType: AccountingMovementOriginType.SIMPLE_TAX_ANNUAL_RETURN,
          originId: annualReturn.id,
          metadata: {
            path: ['kind'],
            equals: 'PAY',
          },
        },
      });
      if (existingMovements > 0) {
        throw new BadRequestException('El pago RST ya tiene movimientos contables.');
      }

      const detail = `Pago declaración anual Régimen Simple ${annualReturn.taxYear}`;
      await tx.accountingMovement.createMany({
        data: [
          {
            businessId,
            pucSubcuentaId: SIMPLE_TAX_PAYABLE_PUC_CODE,
            amount: paidAmount,
            nature: MovementNature.DEBIT,
            date: paymentDate,
            detail: `${detail} - Impuesto simple por pagar`,
            originType: AccountingMovementOriginType.SIMPLE_TAX_ANNUAL_RETURN,
            originId: annualReturn.id,
            metadata: {
              annualReturnId: annualReturn.id,
              kind: 'PAY',
              taxYear: annualReturn.taxYear,
              paymentAccountCode,
            },
          },
          {
            businessId,
            pucSubcuentaId: paymentAccountCode,
            amount: paidAmount,
            nature: MovementNature.CREDIT,
            date: paymentDate,
            detail:
              dto.paymentMethod === SimpleTaxPaymentMethod.CASH
                ? 'Pago Régimen Simple en efectivo'
                : 'Pago Régimen Simple por banco',
            originType: AccountingMovementOriginType.SIMPLE_TAX_ANNUAL_RETURN,
            originId: annualReturn.id,
            metadata: {
              annualReturnId: annualReturn.id,
              kind: 'PAY',
              taxYear: annualReturn.taxYear,
              paymentMethod: dto.paymentMethod,
              paymentAccountCode,
              notes: dto.notes ?? null,
            },
          },
        ],
      });

      return tx.simpleTaxAnnualReturn.update({
        where: { id: annualReturn.id },
        data: {
          status: SimpleTaxAnnualReturnStatus.PAID,
          paidAt: paymentDate,
          paidAmount,
          paymentAccountCode,
          paidAccountingEntryId,
        },
      });
    });
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async assertTaxSettingsEnabled(businessId: string) {
    const profile = await this.prisma.businessTaxProfile.findUnique({
      where: { businessId },
      select: { taxSettingsEnabled: true },
    });
    if (!profile?.taxSettingsEnabled) {
      throw new BadRequestException(
        'La configuración fiscal está desactivada. Active "RUT e Impuestos" para usar el Régimen Simple.',
      );
    }
  }
}
