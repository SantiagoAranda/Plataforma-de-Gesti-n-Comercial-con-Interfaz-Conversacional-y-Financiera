import { Prisma, TaxType } from '@prisma/client';
import { sumRoundedFiscalAmounts } from './fiscal-rounding';

export type SummableTaxLine = {
  taxType: TaxType;
  taxAmount: Prisma.Decimal.Value;
  applied: boolean;
  isReversal?: boolean;
};

export function sumTaxLinesByType(
  lines: readonly SummableTaxLine[],
  taxType: TaxType,
  options: { includeReversals?: boolean } = {},
): Prisma.Decimal {
  return sumRoundedFiscalAmounts(
    lines
      .filter(
        (line) =>
          line.applied &&
          line.taxType === taxType &&
          (options.includeReversals || !line.isReversal),
      )
      .map((line) => line.taxAmount),
  );
}

