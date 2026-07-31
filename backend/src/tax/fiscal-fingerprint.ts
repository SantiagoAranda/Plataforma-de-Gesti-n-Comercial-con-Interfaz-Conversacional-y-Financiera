import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

type CanonicalValue =
  | null
  | boolean
  | string
  | number
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function canonicalDecimal(value: Prisma.Decimal): string {
  if (!value.isFinite() || value.isNaN()) {
    throw new TypeError('INVALID_FISCAL_DECIMAL');
  }
  return value.isZero() ? '0' : value.toString();
}

function canonicalize(value: unknown): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (value instanceof Prisma.Decimal) return canonicalDecimal(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('INVALID_FISCAL_NUMBER');
    return canonicalDecimal(new Prisma.Decimal(value));
  }
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .filter((item): item is CanonicalValue => item !== undefined)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (typeof value === 'object') {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as object).sort()) {
      const item = canonicalize((value as Record<string, unknown>)[key]);
      if (item !== undefined) result[key] = item;
    }
    return result;
  }
  throw new TypeError('UNSUPPORTED_FISCAL_FINGERPRINT_VALUE');
}

export function stableFiscalSerialization(input: unknown): string {
  return JSON.stringify(canonicalize(input));
}

export function createFiscalSourceFingerprint(input: unknown): string {
  return createHash('sha256')
    .update(stableFiscalSerialization(input), 'utf8')
    .digest('hex');
}
