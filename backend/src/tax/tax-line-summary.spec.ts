import { Prisma, TaxType } from '@prisma/client';
import {
  isInformationalTaxType,
  sumTaxLinesByType,
} from './tax-line-summary';

describe('tax line summaries', () => {
  const lines = [
    {
      taxType: TaxType.IVA,
      taxAmount: new Prisma.Decimal('10.01'),
      applied: true,
      isReversal: false,
    },
    {
      taxType: TaxType.IVA,
      taxAmount: new Prisma.Decimal('4.99'),
      applied: true,
      isReversal: false,
    },
    {
      taxType: TaxType.IVA,
      taxAmount: new Prisma.Decimal('-10.01'),
      applied: true,
      isReversal: true,
    },
  ];

  it('sums every original line of the requested type', () => {
    expect(sumTaxLinesByType(lines, TaxType.IVA).toFixed(2)).toBe('15.00');
  });

  it('can produce a net report including reversals', () => {
    expect(
      sumTaxLinesByType(lines, TaxType.IVA, { includeReversals: true }).toFixed(
        2,
      ),
    ).toBe('4.99');
  });

  it('classifies only zero-tax treatments as informational', () => {
    expect(isInformationalTaxType(TaxType.EXEMPT)).toBe(true);
    expect(isInformationalTaxType(TaxType.EXCLUDED)).toBe(true);
    expect(isInformationalTaxType(TaxType.NOT_TAXED)).toBe(true);
    expect(isInformationalTaxType(TaxType.NONE)).toBe(true);
    expect(isInformationalTaxType(TaxType.IVA)).toBe(false);
    expect(isInformationalTaxType(TaxType.RETEFUENTE)).toBe(false);
  });
});
