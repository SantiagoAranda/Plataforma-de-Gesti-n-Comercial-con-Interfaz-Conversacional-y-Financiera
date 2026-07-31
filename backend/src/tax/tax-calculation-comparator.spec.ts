import { ItemTaxTreatment, Prisma } from '@prisma/client';
import { LineTaxInput } from './line-tax-calculator';
import { compareAggregateAndLineTaxes } from './tax-calculation-comparator';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const line = (unitPrice: string): LineTaxInput => ({
  quantity: d(1),
  unitPrice: d(unitPrice),
  taxTreatment: ItemTaxTreatment.TAXED,
  vatRate: null,
  globalVatRate: d(0.19),
  appliesImpoconsumo: false,
  impoconsumoRate: null,
  globalImpoconsumoRate: d(0.08),
  sellerIsVatResponsible: true,
  sellerIsNaturalNonVatResponsible: false,
});

describe('compareAggregateAndLineTaxes', () => {
  it('reports every difference as candidate minus current', () => {
    const result = compareAggregateAndLineTaxes({
      lines: [line('0.03'), line('0.03')],
      currentAggregateResult: {
        subtotal: d(0.06),
        vat: d(0.01),
        impoconsumo: d(0),
        grossTotal: d(0.07),
      },
    });

    expect(result.candidateLineResult.vat.toFixed(2)).toBe('0.02');
    expect(result.difference.vat.toFixed(2)).toBe('0.01');
    expect(result.difference.grossTotal.toFixed(2)).toBe('0.01');
  });

  it('keeps each retention and net received projection separate', () => {
    const result = compareAggregateAndLineTaxes({
      lines: [line('1000000')],
      currentAggregateResult: {
        subtotal: d(1000000),
        vat: d(190000),
        impoconsumo: d(0),
        grossTotal: d(1190000),
      },
      retentionPolicy: {
        withholdingTax: { applies: true, rate: d(0.025) },
        vatWithholding: { applies: true, rate: d(0.15) },
        icaWithholding: { applies: true, rate: d(0.00966) },
        selfWithholding: { applies: true, rate: d(0.008) },
      },
    });

    expect(result.retentionProjection.candidate.withholdingTax.toFixed(2)).toBe(
      '25000.00',
    );
    expect(result.retentionProjection.candidate.vatWithholding.toFixed(2)).toBe(
      '28500.00',
    );
    expect(result.retentionProjection.candidate.icaWithholding.toFixed(2)).toBe(
      '9660.00',
    );
    expect(result.retentionProjection.candidate.selfWithholding.toFixed(2)).toBe(
      '8000.00',
    );
    expect(result.retentionProjection.candidate.netReceived.toFixed(2)).toBe(
      '1126840.00',
    );
  });
});
