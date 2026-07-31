import { Prisma } from '@prisma/client';

type FiscalLine = {
  fiscalContextId: string;
  taxType: string;
  direction: string;
  taxTreatment?: string | null;
  taxableBase: Prisma.Decimal.Value;
  rate: Prisma.Decimal.Value;
  taxAmount: Prisma.Decimal.Value;
  saleConcept?: string | null;
  calculationMethod: string;
  roundingMode: string;
  roundingScale: number;
  accountCode: string;
  isReversal: boolean;
};

export function assertExactFiscalReversalLine(
  original: FiscalLine,
  reversal: FiscalLine,
) {
  const same =
    !original.isReversal &&
    reversal.isReversal &&
    original.fiscalContextId === reversal.fiscalContextId &&
    original.taxType === reversal.taxType &&
    original.direction === reversal.direction &&
    original.taxTreatment === reversal.taxTreatment &&
    new Prisma.Decimal(original.rate).eq(reversal.rate) &&
    new Prisma.Decimal(original.taxableBase).negated().eq(reversal.taxableBase) &&
    new Prisma.Decimal(original.taxAmount).negated().eq(reversal.taxAmount) &&
    original.saleConcept === reversal.saleConcept &&
    original.calculationMethod === reversal.calculationMethod &&
    original.roundingMode === reversal.roundingMode &&
    original.roundingScale === reversal.roundingScale &&
    original.accountCode === reversal.accountCode;
  if (!same) {
    throw Object.assign(new Error('Invalid fiscal reversal line'), {
      code: 'INVALID_FISCAL_REVERSAL_LINE',
    });
  }
}
