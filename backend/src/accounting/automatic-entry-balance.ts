import { ConflictException } from '@nestjs/common';
import { MovementNature, Prisma } from '@prisma/client';
import {
  roundCalculatedFiscalAmount,
  sumRoundedFiscalAmounts,
} from '../tax/fiscal-rounding';

export type BalanceLine = {
  amount: Prisma.Decimal.Value;
  nature: MovementNature;
};

export class AutomaticEntryUnbalancedException extends ConflictException {
  constructor(
    debitTotal: Prisma.Decimal,
    creditTotal: Prisma.Decimal,
  ) {
    const difference = debitTotal.sub(creditTotal);
    super({
      code: 'AUTOMATIC_ENTRY_UNBALANCED',
      debitTotal: debitTotal.toFixed(2),
      creditTotal: creditTotal.toFixed(2),
      difference: difference.toFixed(2),
    });
  }
}

export function assertBalancedEntry(lines: readonly BalanceLine[]) {
  const normalized = lines.map((line) => ({
    nature: line.nature,
    amount: roundCalculatedFiscalAmount(line.amount),
  }));
  const debitTotal = sumRoundedFiscalAmounts(
    normalized
      .filter((line) => line.nature === MovementNature.DEBIT)
      .map((line) => line.amount),
  );
  const creditTotal = sumRoundedFiscalAmounts(
    normalized
      .filter((line) => line.nature === MovementNature.CREDIT)
      .map((line) => line.amount),
  );
  if (!debitTotal.eq(creditTotal)) {
    throw new AutomaticEntryUnbalancedException(debitTotal, creditTotal);
  }
  return { lines: normalized, debitTotal, creditTotal };
}

