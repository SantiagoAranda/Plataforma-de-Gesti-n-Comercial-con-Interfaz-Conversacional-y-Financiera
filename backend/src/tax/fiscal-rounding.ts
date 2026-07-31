import { Prisma } from '@prisma/client';

const MONEY_SCALE = 2;
const RATE_SCALE = 6;
const ROUNDING = Prisma.Decimal.ROUND_HALF_UP;

function decimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  const result = new Prisma.Decimal(value);
  if (!result.isFinite() || result.isNaN()) {
    throw new TypeError('INVALID_FISCAL_DECIMAL');
  }
  return result;
}

export function roundCalculatedFiscalAmount(
  value: Prisma.Decimal.Value,
): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(MONEY_SCALE, ROUNDING);
}

export function roundFiscalRate(
  value: Prisma.Decimal.Value,
): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(RATE_SCALE, ROUNDING);
}

export function sumRoundedFiscalAmounts(
  values: readonly Prisma.Decimal.Value[],
): Prisma.Decimal {
  const total = values.reduce<Prisma.Decimal>(
    (sum, value) => sum.add(decimal(value)),
    new Prisma.Decimal(0),
  );
  return total.toDecimalPlaces(MONEY_SCALE, ROUNDING);
}
