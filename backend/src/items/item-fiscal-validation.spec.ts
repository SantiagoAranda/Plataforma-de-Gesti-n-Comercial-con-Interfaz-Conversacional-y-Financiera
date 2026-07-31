import { ItemTaxTreatment, Prisma } from '@prisma/client';
import { validateItemFiscalConfiguration } from './item-fiscal-validation';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('validateItemFiscalConfiguration', () => {
  it.each([
    [ItemTaxTreatment.TAXED, null],
    [ItemTaxTreatment.TAXED, d(0.19)],
    [ItemTaxTreatment.EXEMPT, null],
    [ItemTaxTreatment.EXEMPT, d(0)],
    [ItemTaxTreatment.EXCLUDED, null],
    [ItemTaxTreatment.NOT_TAXED, null],
  ])('accepts coherent %s treatment', (taxTreatment, vatRate) => {
    expect(
      validateItemFiscalConfiguration({
        taxTreatment,
        vatRate,
        appliesImpoconsumo: false,
        impoconsumoRate: null,
      }),
    ).toBeNull();
  });

  it('rejects explicit zero VAT for TAXED', () => {
    expect(
      validateItemFiscalConfiguration({
        taxTreatment: ItemTaxTreatment.TAXED,
        vatRate: d(0),
        appliesImpoconsumo: false,
        impoconsumoRate: null,
      })?.code,
    ).toBe('TAXED_ZERO_VAT_RATE');
  });

  it('rejects VAT together with impoconsumo', () => {
    expect(
      validateItemFiscalConfiguration({
        taxTreatment: ItemTaxTreatment.TAXED,
        vatRate: d(0.19),
        appliesImpoconsumo: true,
        impoconsumoRate: d(0.08),
      })?.code,
    ).toBe('IMPOCONSUMO_FORBIDS_VAT_RATE');
  });
});
