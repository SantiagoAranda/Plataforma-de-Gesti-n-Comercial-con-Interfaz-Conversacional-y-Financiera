import { Prisma } from '@prisma/client';
import {
  roundCalculatedFiscalAmount,
  sumRoundedFiscalAmounts,
} from './fiscal-rounding';

export class V2FiscalInvariantError extends Error {
  constructor(
    public readonly code:
      | 'COMMERCIAL_DISCOUNTS_NOT_SUPPORTED'
      | 'ORDER_TOTAL_FISCAL_BASE_MISMATCH'
      | 'RESERVATION_FISCAL_BASE_MISMATCH'
      | 'RESERVATION_MULTILINE_NOT_SUPPORTED'
      | 'RETENTIONS_EXCEED_GROSS_TOTAL',
    public readonly details?: Record<string, string>,
  ) {
    super(code);
    this.name = 'V2FiscalInvariantError';
  }
}

export function assertZeroCommercialDiscounts(
  lines: Array<{
    discountRate?: Prisma.Decimal.Value;
    discountAmount?: Prisma.Decimal.Value;
  }>,
): void {
  if (
    lines.some(
      (line) =>
        !new Prisma.Decimal(line.discountRate ?? 0).eq(0) ||
        !new Prisma.Decimal(line.discountAmount ?? 0).eq(0),
    )
  ) {
    throw new V2FiscalInvariantError(
      'COMMERCIAL_DISCOUNTS_NOT_SUPPORTED',
    );
  }
}

export function assertOrderTotalMatchesFiscalSubtotal(
  orderTotal: Prisma.Decimal.Value,
  fiscalSubtotal: Prisma.Decimal.Value,
): void {
  const commercial = roundCalculatedFiscalAmount(orderTotal);
  const fiscal = roundCalculatedFiscalAmount(fiscalSubtotal);
  if (!commercial.eq(fiscal)) {
    throw new V2FiscalInvariantError('ORDER_TOTAL_FISCAL_BASE_MISMATCH', {
      orderTotal: commercial.toFixed(2),
      fiscalSubtotal: fiscal.toFixed(2),
    });
  }
}

export function assertReservationFiscalShape(input: {
  lineCount: number;
  quantity: Prisma.Decimal.Value;
  unitPriceSnapshot: Prisma.Decimal.Value | null | undefined;
  fiscalSubtotal: Prisma.Decimal.Value;
}): void {
  if (input.lineCount !== 1 || !new Prisma.Decimal(input.quantity).eq(1)) {
    throw new V2FiscalInvariantError(
      'RESERVATION_MULTILINE_NOT_SUPPORTED',
    );
  }
  if (
    input.unitPriceSnapshot == null ||
    !roundCalculatedFiscalAmount(input.unitPriceSnapshot).eq(
      roundCalculatedFiscalAmount(input.fiscalSubtotal),
    )
  ) {
    throw new V2FiscalInvariantError(
      'RESERVATION_FISCAL_BASE_MISMATCH',
    );
  }
}

export function assertRetentionsWithinGross(input: {
  grossFiscalTotal: Prisma.Decimal.Value;
  withholdingTax: Prisma.Decimal.Value;
  vatWithholding: Prisma.Decimal.Value;
  icaWithholding: Prisma.Decimal.Value;
}): Prisma.Decimal {
  const buyerRetentions = sumRoundedFiscalAmounts([
    input.withholdingTax,
    input.vatWithholding,
    input.icaWithholding,
  ]);
  if (buyerRetentions.gt(input.grossFiscalTotal)) {
    throw new V2FiscalInvariantError('RETENTIONS_EXCEED_GROSS_TOTAL');
  }
  return buyerRetentions;
}
