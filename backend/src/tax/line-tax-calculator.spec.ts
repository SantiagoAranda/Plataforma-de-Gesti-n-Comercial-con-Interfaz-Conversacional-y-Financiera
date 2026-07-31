import { ItemTaxTreatment, Prisma } from '@prisma/client';
import {
  calculateLineTax,
  LineTaxCalculationError,
  LineTaxInput,
} from './line-tax-calculator';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const input = (overrides: Partial<LineTaxInput> = {}): LineTaxInput => ({
  quantity: d(1),
  unitPrice: d(100),
  taxTreatment: ItemTaxTreatment.TAXED,
  vatRate: null,
  globalVatRate: d(0.19),
  appliesImpoconsumo: false,
  impoconsumoRate: null,
  globalImpoconsumoRate: d(0.08),
  sellerIsVatResponsible: true,
  sellerIsNaturalNonVatResponsible: false,
  ...overrides,
});

function expectError(overrides: Partial<LineTaxInput>, code: string) {
  try {
    calculateLineTax(input(overrides));
    throw new Error('Expected calculateLineTax to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(LineTaxCalculationError);
    expect((error as LineTaxCalculationError).code).toBe(code);
  }
}

describe('calculateLineTax', () => {
  it('rounds base and then tax with ROUND_HALF_UP', () => {
    const result = calculateLineTax(
      input({ quantity: d(3), unitPrice: d('0.335') }),
    );

    expect(result.baseAmount.toFixed(2)).toBe('1.01');
    expect(result.taxAmount.toFixed(2)).toBe('0.19');
    expect(result.grossAmount.toFixed(2)).toBe('1.20');
  });

  it('uses the item VAT rate before the global rate', () => {
    const result = calculateLineTax(input({ vatRate: d(0.05) }));

    expect(result.taxType).toBe('VAT');
    expect(result.taxRate.toString()).toBe('0.05');
    expect(result.taxAmount.toFixed(2)).toBe('5.00');
  });

  it('allows a zero-priced item', () => {
    const result = calculateLineTax(input({ unitPrice: d(0) }));

    expect(result.baseAmount.eq(0)).toBe(true);
    expect(result.grossAmount.eq(0)).toBe(true);
  });

  it('accepts zero global rates as valid configuration', () => {
    const result = calculateLineTax(
      input({
        globalVatRate: d(0),
        globalImpoconsumoRate: d(0),
      }),
    );

    expect(result.taxType).toBe('VAT');
    expect(result.taxAmount.eq(0)).toBe(true);
  });

  it('gives impoconsumo precedence over the seller VAT responsibility', () => {
    const result = calculateLineTax(
      input({
        appliesImpoconsumo: true,
        sellerIsVatResponsible: false,
        sellerIsNaturalNonVatResponsible: true,
      }),
    );

    expect(result.taxType).toBe('IMPOCONSUMO');
    expect(result.taxAmount.toFixed(2)).toBe('8.00');
  });

  it.each([
    [ItemTaxTreatment.EXEMPT, 'EXEMPT'],
    [ItemTaxTreatment.EXCLUDED, 'EXCLUDED'],
    [ItemTaxTreatment.NOT_TAXED, 'NOT_TAXED'],
  ])('preserves zero-tax treatment %s', (taxTreatment, taxType) => {
    const result = calculateLineTax(
      input({
        taxTreatment,
        vatRate: taxTreatment === ItemTaxTreatment.EXEMPT ? d(0) : null,
      }),
    );

    expect(result.taxType).toBe(taxType);
    expect(result.taxAmount.eq(0)).toBe(true);
  });

  it('keeps TAXED potential treatment without VAT for non-responsible seller', () => {
    const result = calculateLineTax(
      input({
        sellerIsVatResponsible: false,
        sellerIsNaturalNonVatResponsible: true,
      }),
    );

    expect(result.taxType).toBe('NONE');
    expect(result.taxAmount.eq(0)).toBe(true);
  });

  it.each([
    [{ quantity: d(0) }, 'INVALID_QUANTITY'],
    [{ quantity: d(-1) }, 'INVALID_QUANTITY'],
    [{ unitPrice: d(-1) }, 'INVALID_UNIT_PRICE'],
    [{ globalVatRate: d('1.01') }, 'INVALID_GLOBAL_VAT_RATE'],
    [{ globalVatRate: d('-0.01') }, 'INVALID_GLOBAL_VAT_RATE'],
    [
      { globalVatRate: undefined as unknown as Prisma.Decimal },
      'INVALID_GLOBAL_VAT_RATE',
    ],
    [
      { globalImpoconsumoRate: d('1.01') },
      'INVALID_GLOBAL_IMPOCONSUMO_RATE',
    ],
    [{ vatRate: d(0) }, 'TAXED_ZERO_VAT_RATE'],
    [
      {
        taxTreatment: ItemTaxTreatment.EXCLUDED,
        vatRate: d(0),
      },
      'VAT_RATE_NOT_ALLOWED',
    ],
    [
      {
        taxTreatment: ItemTaxTreatment.EXEMPT,
        appliesImpoconsumo: true,
      },
      'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT',
    ],
    [
      { appliesImpoconsumo: true, vatRate: d(0.19) },
      'IMPOCONSUMO_FORBIDS_VAT_RATE',
    ],
    [
      {
        sellerIsVatResponsible: true,
        sellerIsNaturalNonVatResponsible: true,
      },
      'INVALID_SELLER_VAT_PROFILE',
    ],
  ])('rejects invalid input with stable code %s', (overrides, code) => {
    expectError(overrides as Partial<LineTaxInput>, code as string);
  });
});
