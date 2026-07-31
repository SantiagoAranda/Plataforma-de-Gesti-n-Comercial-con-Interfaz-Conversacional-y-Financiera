import { Prisma } from '@prisma/client';
import {
  createFiscalSourceFingerprint,
  stableFiscalSerialization,
} from './fiscal-fingerprint';

describe('fiscal source fingerprint', () => {
  it('normalizes equivalent decimals, object keys and negative zero', () => {
    const first = {
      lines: [{ id: 'b', amount: new Prisma.Decimal('19.00') }],
      value: -0,
    };
    const second = {
      value: 0,
      lines: [{ amount: new Prisma.Decimal('19'), id: 'b' }],
    };
    expect(stableFiscalSerialization(first)).toBe(
      stableFiscalSerialization(second),
    );
    expect(createFiscalSourceFingerprint(first)).toBe(
      createFiscalSourceFingerprint(second),
    );
  });

  it('changes when a fiscal source value changes', () => {
    expect(createFiscalSourceFingerprint({ quantity: 1 })).not.toBe(
      createFiscalSourceFingerprint({ quantity: 2 }),
    );
  });

  it('does not depend on the visual order of fiscal lines', () => {
    expect(
      createFiscalSourceFingerprint({
        lines: [{ id: 'b', quantity: 1 }, { id: 'a', quantity: 2 }],
      }),
    ).toBe(
      createFiscalSourceFingerprint({
        lines: [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }],
      }),
    );
  });
});
