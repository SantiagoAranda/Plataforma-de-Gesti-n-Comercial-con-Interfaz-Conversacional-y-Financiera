import { ItemTaxTreatment, Prisma } from '@prisma/client';

export type LineTaxErrorCode =
  | 'INVALID_SELLER_VAT_PROFILE'
  | 'TAXED_ZERO_VAT_RATE'
  | 'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT'
  | 'IMPOCONSUMO_FORBIDS_VAT_RATE'
  | 'VAT_RATE_NOT_ALLOWED'
  | 'INVALID_GLOBAL_VAT_RATE'
  | 'INVALID_GLOBAL_IMPOCONSUMO_RATE'
  | 'INVALID_QUANTITY'
  | 'INVALID_UNIT_PRICE'
  | 'COMMERCIAL_DISCOUNTS_NOT_SUPPORTED';

export class LineTaxCalculationError extends Error {
  constructor(public readonly code: LineTaxErrorCode) {
    super(code);
    this.name = 'LineTaxCalculationError';
  }
}

export type LineTaxInput = {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountRate?: Prisma.Decimal;
  discountAmount?: Prisma.Decimal;
  taxTreatment: ItemTaxTreatment;
  vatRate: Prisma.Decimal | null;
  globalVatRate: Prisma.Decimal;
  appliesImpoconsumo: boolean;
  impoconsumoRate: Prisma.Decimal | null;
  globalImpoconsumoRate: Prisma.Decimal;
  sellerIsVatResponsible: boolean;
  sellerIsNaturalNonVatResponsible: boolean;
};

export type LineTaxType =
  | 'VAT'
  | 'IMPOCONSUMO'
  | 'EXEMPT'
  | 'EXCLUDED'
  | 'NOT_TAXED'
  | 'NONE';

export type LineTaxResult = {
  baseAmount: Prisma.Decimal;
  taxTreatment: ItemTaxTreatment;
  taxType: LineTaxType;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

export function roundTaxAmount(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function isFiniteDecimal(value: unknown): value is Prisma.Decimal {
  return (
    Prisma.Decimal.isDecimal(value) &&
    !(value as Prisma.Decimal).isNaN() &&
    (value as Prisma.Decimal).isFinite()
  );
}

function assertRate(
  rate: unknown,
  code: 'INVALID_GLOBAL_VAT_RATE' | 'INVALID_GLOBAL_IMPOCONSUMO_RATE',
): asserts rate is Prisma.Decimal {
  if (
    !isFiniteDecimal(rate) ||
    (rate as Prisma.Decimal).lt(0) ||
    (rate as Prisma.Decimal).gt(1)
  ) {
    throw new LineTaxCalculationError(code);
  }
}

export function calculateLineTax(input: LineTaxInput): LineTaxResult {
  if (
    input.sellerIsVatResponsible &&
    input.sellerIsNaturalNonVatResponsible
  ) {
    throw new LineTaxCalculationError('INVALID_SELLER_VAT_PROFILE');
  }
  if (!isFiniteDecimal(input.quantity) || input.quantity.lte(0)) {
    throw new LineTaxCalculationError('INVALID_QUANTITY');
  }
  if (!isFiniteDecimal(input.unitPrice) || input.unitPrice.lt(0)) {
    throw new LineTaxCalculationError('INVALID_UNIT_PRICE');
  }
  const discountRate = input.discountRate ?? ZERO;
  const discountAmount = input.discountAmount ?? ZERO;
  if (
    !isFiniteDecimal(discountRate) ||
    !isFiniteDecimal(discountAmount) ||
    !discountRate.eq(0) ||
    !discountAmount.eq(0)
  ) {
    throw new LineTaxCalculationError('COMMERCIAL_DISCOUNTS_NOT_SUPPORTED');
  }

  assertRate(input.globalVatRate, 'INVALID_GLOBAL_VAT_RATE');
  assertRate(
    input.globalImpoconsumoRate,
    'INVALID_GLOBAL_IMPOCONSUMO_RATE',
  );

  if (
    input.vatRate !== null &&
    (!isFiniteDecimal(input.vatRate) ||
      input.vatRate.lt(0) ||
      input.vatRate.gt(1))
  ) {
    throw new LineTaxCalculationError('VAT_RATE_NOT_ALLOWED');
  }
  if (
    input.impoconsumoRate !== null &&
    (!isFiniteDecimal(input.impoconsumoRate) ||
      input.impoconsumoRate.lte(0) ||
      input.impoconsumoRate.gt(1))
  ) {
    throw new LineTaxCalculationError(
      'INVALID_GLOBAL_IMPOCONSUMO_RATE',
    );
  }

  if (
    input.taxTreatment === ItemTaxTreatment.TAXED &&
    input.vatRate?.eq(0)
  ) {
    throw new LineTaxCalculationError('TAXED_ZERO_VAT_RATE');
  }
  if (
    input.taxTreatment === ItemTaxTreatment.EXEMPT &&
    input.vatRate !== null &&
    !input.vatRate.eq(0)
  ) {
    throw new LineTaxCalculationError('VAT_RATE_NOT_ALLOWED');
  }
  if (
    (input.taxTreatment === ItemTaxTreatment.EXCLUDED ||
      input.taxTreatment === ItemTaxTreatment.NOT_TAXED) &&
    input.vatRate !== null
  ) {
    throw new LineTaxCalculationError('VAT_RATE_NOT_ALLOWED');
  }
  if (
    input.appliesImpoconsumo &&
    input.taxTreatment !== ItemTaxTreatment.TAXED
  ) {
    throw new LineTaxCalculationError(
      'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT',
    );
  }
  if (input.appliesImpoconsumo && input.vatRate !== null) {
    throw new LineTaxCalculationError('IMPOCONSUMO_FORBIDS_VAT_RATE');
  }

  const baseAmount = roundTaxAmount(
    input.quantity.mul(input.unitPrice).sub(discountAmount),
  );
  let taxType: LineTaxType;
  let taxRate = ZERO;

  if (input.appliesImpoconsumo) {
    taxType = 'IMPOCONSUMO';
    taxRate = input.impoconsumoRate ?? input.globalImpoconsumoRate;
  } else if (input.taxTreatment === ItemTaxTreatment.EXEMPT) {
    taxType = 'EXEMPT';
  } else if (input.taxTreatment === ItemTaxTreatment.EXCLUDED) {
    taxType = 'EXCLUDED';
  } else if (input.taxTreatment === ItemTaxTreatment.NOT_TAXED) {
    taxType = 'NOT_TAXED';
  } else if (
    input.sellerIsVatResponsible &&
    !input.sellerIsNaturalNonVatResponsible
  ) {
    taxType = 'VAT';
    taxRate = input.vatRate ?? input.globalVatRate;
  } else {
    taxType = 'NONE';
  }

  const taxAmount = roundTaxAmount(baseAmount.mul(taxRate));
  const grossAmount = roundTaxAmount(baseAmount.add(taxAmount));

  return {
    baseAmount,
    taxTreatment: input.taxTreatment,
    taxType,
    taxRate,
    taxAmount,
    grossAmount,
  };
}
