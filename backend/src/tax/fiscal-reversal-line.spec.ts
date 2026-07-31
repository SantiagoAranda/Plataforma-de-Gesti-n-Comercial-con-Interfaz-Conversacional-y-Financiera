import { Prisma } from '@prisma/client';
import { assertExactFiscalReversalLine } from './fiscal-reversal-line';

const original = {
  fiscalContextId: 'context-1',
  taxType: 'IVA',
  direction: 'CHARGE',
  taxTreatment: 'TAXED',
  taxableBase: new Prisma.Decimal('100.00'),
  rate: new Prisma.Decimal('0.190000'),
  taxAmount: new Prisma.Decimal('19.00'),
  saleConcept: 'GOODS',
  calculationMethod: 'AGGREGATE_V1',
  roundingMode: 'DATABASE_DEFAULT',
  roundingScale: 2,
  accountCode: '2408',
  isReversal: false,
};

describe('fiscal reversal lines', () => {
  it('accepts an exact opposite while preserving fiscal direction', () => {
    expect(() =>
      assertExactFiscalReversalLine(original, {
        ...original,
        taxableBase: new Prisma.Decimal('-100.00'),
        taxAmount: new Prisma.Decimal('-19.00'),
        isReversal: true,
      }),
    ).not.toThrow();
  });

  it('rejects arbitrary negative lines', () => {
    expect(() =>
      assertExactFiscalReversalLine(original, {
        ...original,
        taxableBase: new Prisma.Decimal('-99.99'),
        taxAmount: new Prisma.Decimal('-19.00'),
        isReversal: true,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_FISCAL_REVERSAL_LINE' }),
    );
  });
});
