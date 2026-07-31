import { Prisma } from '@prisma/client';
import {
  assertOrderTotalMatchesFiscalSubtotal,
  assertReservationFiscalShape,
  assertRetentionsWithinGross,
  assertZeroCommercialDiscounts,
} from './v2-fiscal-invariants';

describe('LINE_ROUNDED_V2 fiscal invariants', () => {
  it('requires commercial discounts to remain zero', () => {
    expect(() =>
      assertZeroCommercialDiscounts([{ discountAmount: '0.01' }]),
    ).toThrow('COMMERCIAL_DISCOUNTS_NOT_SUPPORTED');
  });

  it('does not silently overwrite a divergent Order.total', () => {
    expect(() =>
      assertOrderTotalMatchesFiscalSubtotal('100.00', '99.99'),
    ).toThrow('ORDER_TOTAL_FISCAL_BASE_MISMATCH');
  });

  it('accepts a single reservation service frozen at quantity one', () => {
    expect(() =>
      assertReservationFiscalShape({
        lineCount: 1,
        quantity: 1,
        unitPriceSnapshot: '100.00',
        fiscalSubtotal: '100.00',
      }),
    ).not.toThrow();
  });

  it('rejects reservation multiline data', () => {
    expect(() =>
      assertReservationFiscalShape({
        lineCount: 2,
        quantity: 1,
        unitPriceSnapshot: 100,
        fiscalSubtotal: 100,
      }),
    ).toThrow('RESERVATION_MULTILINE_NOT_SUPPORTED');
  });

  it('rejects buyer retentions above gross total', () => {
    expect(() =>
      assertRetentionsWithinGross({
        grossFiscalTotal: new Prisma.Decimal(100),
        withholdingTax: new Prisma.Decimal(80),
        vatWithholding: new Prisma.Decimal(21),
        icaWithholding: new Prisma.Decimal(0),
      }),
    ).toThrow('RETENTIONS_EXCEED_GROSS_TOTAL');
  });
});
