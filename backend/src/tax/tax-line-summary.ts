import { Prisma, TaxType } from '@prisma/client';
import { sumRoundedFiscalAmounts } from './fiscal-rounding';

export type SummableTaxLine = {
  taxType: TaxType;
  taxAmount: Prisma.Decimal.Value;
  applied: boolean;
  isReversal?: boolean;
};

const INFORMATIONAL_TAX_TYPES = new Set<TaxType>([
  TaxType.EXEMPT,
  TaxType.EXCLUDED,
  TaxType.NOT_TAXED,
  TaxType.NONE,
]);

export function isInformationalTaxType(taxType: TaxType): boolean {
  return INFORMATIONAL_TAX_TYPES.has(taxType);
}

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
