import { Prisma } from '@prisma/client';
import {
  calculateLineTax,
  LineTaxInput,
  LineTaxResult,
  roundTaxAmount,
} from './line-tax-calculator';

export type TaxTotals = {
  subtotal: Prisma.Decimal;
  vat: Prisma.Decimal;
  impoconsumo: Prisma.Decimal;
  grossTotal: Prisma.Decimal;
};

export type RetentionAmounts = {
  withholdingTax: Prisma.Decimal;
  vatWithholding: Prisma.Decimal;
  icaWithholding: Prisma.Decimal;
  selfWithholding: Prisma.Decimal;
  netReceived: Prisma.Decimal;
};

export type RetentionRule = {
  applies: boolean;
  rate: Prisma.Decimal;
  minimumBase?: Prisma.Decimal;
};

export type RetentionProjectionPolicy = {
  withholdingTax?: RetentionRule;
  vatWithholding?: RetentionRule;
  icaWithholding?: RetentionRule;
  selfWithholding?: RetentionRule;
};

export type TaxComparisonResult = {
  currentAggregateResult: TaxTotals;
  candidateLineResult: TaxTotals;
  difference: TaxTotals;
  lineBreakdown: LineTaxResult[];
  retentionProjection: {
    current: RetentionAmounts;
    candidate: RetentionAmounts;
    difference: RetentionAmounts;
  };
};

const zero = () => new Prisma.Decimal(0);

function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.add(value), zero());
}

function difference(candidate: Prisma.Decimal, current: Prisma.Decimal) {
  return candidate.sub(current);
}

function calculateRetention(
  base: Prisma.Decimal,
  rule?: RetentionRule,
): Prisma.Decimal {
  if (
    !rule?.applies ||
    (rule.minimumBase !== undefined && base.lt(rule.minimumBase))
  ) {
    return zero();
  }
  return roundTaxAmount(base.mul(rule.rate));
}

function projectRetentions(
  totals: TaxTotals,
  policy: RetentionProjectionPolicy,
): RetentionAmounts {
  const withholdingTax = calculateRetention(
    totals.subtotal,
    policy.withholdingTax,
  );
  const vatWithholding = calculateRetention(totals.vat, policy.vatWithholding);
  const icaWithholding = calculateRetention(
    totals.subtotal,
    policy.icaWithholding,
  );
  const selfWithholding = calculateRetention(
    totals.subtotal,
    policy.selfWithholding,
  );
  const netReceived = Prisma.Decimal.max(
    zero(),
    totals.grossTotal
      .sub(withholdingTax)
      .sub(vatWithholding)
      .sub(icaWithholding),
  );

  return {
    withholdingTax,
    vatWithholding,
    icaWithholding,
    selfWithholding,
    netReceived,
  };
}

export function compareAggregateAndLineTaxes(input: {
  lines: LineTaxInput[];
  currentAggregateResult: TaxTotals;
  retentionPolicy?: RetentionProjectionPolicy;
}): TaxComparisonResult {
  const lineBreakdown = input.lines.map(calculateLineTax);
  const candidateLineResult: TaxTotals = {
    subtotal: sum(lineBreakdown.map((line) => line.baseAmount)),
    vat: sum(
      lineBreakdown
        .filter((line) => line.taxType === 'VAT')
        .map((line) => line.taxAmount),
    ),
    impoconsumo: sum(
      lineBreakdown
        .filter((line) => line.taxType === 'IMPOCONSUMO')
        .map((line) => line.taxAmount),
    ),
    grossTotal: sum(lineBreakdown.map((line) => line.grossAmount)),
  };
  const current = input.currentAggregateResult;
  const retentionPolicy = input.retentionPolicy ?? {};
  const currentRetentions = projectRetentions(current, retentionPolicy);
  const candidateRetentions = projectRetentions(
    candidateLineResult,
    retentionPolicy,
  );

  return {
    currentAggregateResult: current,
    candidateLineResult,
    difference: {
      subtotal: difference(candidateLineResult.subtotal, current.subtotal),
      vat: difference(candidateLineResult.vat, current.vat),
      impoconsumo: difference(
        candidateLineResult.impoconsumo,
        current.impoconsumo,
      ),
      grossTotal: difference(
        candidateLineResult.grossTotal,
        current.grossTotal,
      ),
    },
    lineBreakdown,
    retentionProjection: {
      current: currentRetentions,
      candidate: candidateRetentions,
      difference: {
        withholdingTax: difference(
          candidateRetentions.withholdingTax,
          currentRetentions.withholdingTax,
        ),
        vatWithholding: difference(
          candidateRetentions.vatWithholding,
          currentRetentions.vatWithholding,
        ),
        icaWithholding: difference(
          candidateRetentions.icaWithholding,
          currentRetentions.icaWithholding,
        ),
        selfWithholding: difference(
          candidateRetentions.selfWithholding,
          currentRetentions.selfWithholding,
        ),
        netReceived: difference(
          candidateRetentions.netReceived,
          currentRetentions.netReceived,
        ),
      },
    },
  };
}
