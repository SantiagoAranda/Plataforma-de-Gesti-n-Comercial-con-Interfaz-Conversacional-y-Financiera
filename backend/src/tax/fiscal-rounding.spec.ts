import { Prisma } from '@prisma/client';
import {
  roundCalculatedFiscalAmount,
  roundFiscalRate,
  sumRoundedFiscalAmounts,
} from './fiscal-rounding';

describe('fiscal rounding 1B-0', () => {
  it('uses ROUND_HALF_UP at scale two for calculated amounts', () => {
    expect(roundCalculatedFiscalAmount('1.005').toFixed(2)).toBe('1.01');
    expect(roundCalculatedFiscalAmount('-1.005').toFixed(2)).toBe('-1.01');
  });

  it('stores rates at scale six', () => {
    expect(roundFiscalRate('0.1234565').toFixed(6)).toBe('0.123457');
  });

  it('sums official rounded amounts without rounding each input again', () => {
    const values = [new Prisma.Decimal('0.01'), new Prisma.Decimal('0.02')];
    expect(sumRoundedFiscalAmounts(values).toFixed(2)).toBe('0.03');
  });
});
