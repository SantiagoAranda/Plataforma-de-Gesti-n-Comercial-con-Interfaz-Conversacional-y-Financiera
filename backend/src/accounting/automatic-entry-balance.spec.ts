import { MovementNature } from '@prisma/client';
import {
  assertBalancedEntry,
  AutomaticEntryUnbalancedException,
} from './automatic-entry-balance';

describe('automatic accounting balance', () => {
  it('requires exact equality after two-decimal rounding', () => {
    expect(() =>
      assertBalancedEntry([
        { nature: MovementNature.DEBIT, amount: '100.00' },
        { nature: MovementNature.CREDIT, amount: '99.99' },
      ]),
    ).toThrow(AutomaticEntryUnbalancedException);
  });

  it('returns exact totals for a balanced entry', () => {
    const result = assertBalancedEntry([
      { nature: MovementNature.DEBIT, amount: '100.005' },
      { nature: MovementNature.CREDIT, amount: '100.01' },
    ]);
    expect(result.debitTotal.toFixed(2)).toBe('100.01');
    expect(result.creditTotal.toFixed(2)).toBe('100.01');
  });
});
