import { ItemTaxTreatment, Prisma } from '@prisma/client';
import {
  LineTaxCalculationError,
  LineTaxErrorCode,
  LineTaxInput,
  roundTaxAmount,
} from './line-tax-calculator';
import {
  compareAggregateAndLineTaxes,
  RetentionProjectionPolicy,
  TaxComparisonResult,
  TaxTotals,
} from './tax-calculation-comparator';

export type FixtureClassification =
  | 'COMPARABLE'
  | 'CURRENT_ENGINE_UNREPRESENTABLE'
  | 'EXPECTED_VALIDATION_ERROR'
  | 'UNEXPECTED_ERROR';

type BaseFixture = {
  name: string;
  classification: FixtureClassification;
  lines: LineTaxInput[];
  retentionPolicy?: RetentionProjectionPolicy;
};

export type ComparableFixture = BaseFixture & {
  classification: 'COMPARABLE';
};

export type UnrepresentableFixture = BaseFixture & {
  classification: 'CURRENT_ENGINE_UNREPRESENTABLE';
  reason: string;
};

export type InvalidFixture = BaseFixture & {
  classification: 'EXPECTED_VALIDATION_ERROR';
  expectedErrorCode: LineTaxErrorCode;
};

export type LineTaxComparisonFixture =
  | ComparableFixture
  | UnrepresentableFixture
  | InvalidFixture;

export type FixtureExecution = {
  fixture: LineTaxComparisonFixture;
  classification: FixtureClassification;
  comparison?: TaxComparisonResult;
  actualErrorCode?: string;
  reason?: string;
};

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

function line(overrides: Partial<LineTaxInput> = {}): LineTaxInput {
  return {
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
  };
}

export const LINE_TAX_COMPARISON_FIXTURES: LineTaxComparisonFixture[] = [
  {
    name: 'Una línea con IVA global',
    classification: 'COMPARABLE',
    lines: [line()],
  },
  {
    name: 'Varias unidades del mismo producto',
    classification: 'COMPARABLE',
    lines: [line({ quantity: d(3), unitPrice: d('123.45') })],
  },
  {
    name: 'Dos líneas con IVA y decimales',
    classification: 'COMPARABLE',
    lines: [
      line({ quantity: d(1), unitPrice: d('749.49') }),
      line({ quantity: d(1), unitPrice: d('747.12') }),
    ],
  },
  {
    name: 'Dos tarifas IVA distintas',
    classification: 'CURRENT_ENGINE_UNREPRESENTABLE',
    reason: 'El motor oficial solo aplica una tarifa IVA global.',
    lines: [
      line({ vatRate: d(0.05) }),
      line({ vatRate: d(0.19) }),
    ],
  },
  {
    name: 'Producto con impoconsumo',
    classification: 'COMPARABLE',
    lines: [
      line({
        appliesImpoconsumo: true,
        impoconsumoRate: null,
      }),
    ],
  },
  {
    name: 'Venta mixta IVA e impoconsumo',
    classification: 'COMPARABLE',
    lines: [
      line({ unitPrice: d('500.25') }),
      line({
        unitPrice: d('300.45'),
        appliesImpoconsumo: true,
      }),
    ],
  },
  {
    name: 'Ítem exento',
    classification: 'CURRENT_ENGINE_UNREPRESENTABLE',
    reason: 'El motor oficial no distingue ítems exentos.',
    lines: [line({ taxTreatment: ItemTaxTreatment.EXEMPT, vatRate: d(0) })],
  },
  {
    name: 'Ítem excluido',
    classification: 'CURRENT_ENGINE_UNREPRESENTABLE',
    reason: 'El motor oficial no distingue ítems excluidos.',
    lines: [line({ taxTreatment: ItemTaxTreatment.EXCLUDED })],
  },
  {
    name: 'Ítem no gravado',
    classification: 'CURRENT_ENGINE_UNREPRESENTABLE',
    reason: 'El motor oficial no distingue ítems no gravados.',
    lines: [line({ taxTreatment: ItemTaxTreatment.NOT_TAXED })],
  },
  {
    name: 'Vendedor no responsable de IVA',
    classification: 'COMPARABLE',
    lines: [
      line({
        sellerIsVatResponsible: false,
        sellerIsNaturalNonVatResponsible: true,
      }),
    ],
  },
  {
    name: 'Tarifa IVA global cuando vatRate es nulo',
    classification: 'COMPARABLE',
    lines: [line({ globalVatRate: d(0.05) })],
  },
  {
    name: 'Tarifa IVA específica igual a la global',
    classification: 'COMPARABLE',
    lines: [line({ vatRate: d(0.19) })],
  },
  {
    name: 'Cantidad decimal',
    classification: 'COMPARABLE',
    lines: [line({ quantity: d('1.25'), unitPrice: d('99.99') })],
  },
  {
    name: 'Precio unitario con más de dos decimales',
    classification: 'COMPARABLE',
    lines: [line({ quantity: d(2), unitPrice: d('10.005') })],
  },
  {
    name: 'Diferencia clásica de un centavo',
    classification: 'COMPARABLE',
    lines: [
      line({ unitPrice: d('0.03') }),
      line({ unitPrice: d('0.03') }),
    ],
  },
  {
    name: 'Proyección desglosada de retenciones',
    classification: 'COMPARABLE',
    lines: [line({ unitPrice: d(1000000) })],
    retentionPolicy: {
      withholdingTax: { applies: true, rate: d(0.025) },
      vatWithholding: { applies: true, rate: d(0.15) },
      icaWithholding: { applies: true, rate: d(0.00966) },
      selfWithholding: { applies: true, rate: d(0.008) },
    },
  },
  {
    name: 'Compensación IVA e INC con total sin diferencia',
    classification: 'COMPARABLE',
    lines: [
      line({ unitPrice: d('0.03') }),
      line({ unitPrice: d('0.03') }),
      line({
        unitPrice: d('0.01'),
        appliesImpoconsumo: true,
      }),
      line({
        unitPrice: d('0.06'),
        appliesImpoconsumo: true,
      }),
    ],
  },
  {
    name: 'Impoconsumo con tratamiento exento',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT',
    lines: [
      line({
        taxTreatment: ItemTaxTreatment.EXEMPT,
        appliesImpoconsumo: true,
      }),
    ],
  },
  {
    name: 'Impoconsumo con tarifa IVA configurada',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'IMPOCONSUMO_FORBIDS_VAT_RATE',
    lines: [
      line({
        appliesImpoconsumo: true,
        vatRate: d(0.19),
      }),
    ],
  },
  {
    name: 'Perfil IVA contradictorio',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'INVALID_SELLER_VAT_PROFILE',
    lines: [
      line({
        sellerIsVatResponsible: true,
        sellerIsNaturalNonVatResponsible: true,
      }),
    ],
  },
  {
    name: 'TAXED con tarifa IVA explícita cero',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'TAXED_ZERO_VAT_RATE',
    lines: [line({ vatRate: d(0) })],
  },
  {
    name: 'Cantidad cero',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'INVALID_QUANTITY',
    lines: [line({ quantity: d(0) })],
  },
  {
    name: 'Precio negativo',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'INVALID_UNIT_PRICE',
    lines: [line({ unitPrice: d(-1) })],
  },
  {
    name: 'Tarifa IVA global fuera de rango',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'INVALID_GLOBAL_VAT_RATE',
    lines: [line({ globalVatRate: d('1.01') })],
  },
  {
    name: 'Tarifa INC global fuera de rango',
    classification: 'EXPECTED_VALIDATION_ERROR',
    expectedErrorCode: 'INVALID_GLOBAL_IMPOCONSUMO_RATE',
    lines: [line({ globalImpoconsumoRate: d('-0.01') })],
  },
];

function aggregateLikeCurrentEngine(lines: LineTaxInput[]): TaxTotals {
  let subtotal = d(0);
  let vat = d(0);
  let impoconsumo = d(0);

  for (const input of lines) {
    const base = input.quantity.mul(input.unitPrice);
    subtotal = subtotal.add(base);

    if (input.sellerIsNaturalNonVatResponsible) continue;
    if (input.appliesImpoconsumo) {
      impoconsumo = impoconsumo.add(
        base.mul(input.impoconsumoRate ?? input.globalImpoconsumoRate),
      );
    } else if (input.sellerIsVatResponsible) {
      vat = vat.add(base.mul(input.globalVatRate));
    }
  }

  const roundedSubtotal = roundTaxAmount(subtotal);
  const roundedVat = roundTaxAmount(vat);
  const roundedImpoconsumo = roundTaxAmount(impoconsumo);
  return {
    subtotal: roundedSubtotal,
    vat: roundedVat,
    impoconsumo: roundedImpoconsumo,
    grossTotal: roundTaxAmount(
      roundedSubtotal.add(roundedVat).add(roundedImpoconsumo),
    ),
  };
}

export function executeLineTaxFixture(
  fixture: LineTaxComparisonFixture,
): FixtureExecution {
  if (fixture.classification === 'CURRENT_ENGINE_UNREPRESENTABLE') {
    return {
      fixture,
      classification: fixture.classification,
      reason: fixture.reason,
    };
  }

  try {
    const comparison = compareAggregateAndLineTaxes({
      lines: fixture.lines,
      currentAggregateResult: aggregateLikeCurrentEngine(fixture.lines),
      retentionPolicy: fixture.retentionPolicy,
    });
    if (fixture.classification === 'EXPECTED_VALIDATION_ERROR') {
      return {
        fixture,
        classification: 'UNEXPECTED_ERROR',
        reason: `Se esperaba ${fixture.expectedErrorCode}, pero el cálculo terminó correctamente.`,
      };
    }
    return { fixture, classification: 'COMPARABLE', comparison };
  } catch (error) {
    const actualErrorCode =
      error instanceof LineTaxCalculationError ? error.code : 'UNKNOWN_ERROR';
    if (
      fixture.classification === 'EXPECTED_VALIDATION_ERROR' &&
      actualErrorCode === fixture.expectedErrorCode
    ) {
      return {
        fixture,
        classification: 'EXPECTED_VALIDATION_ERROR',
        actualErrorCode,
      };
    }
    return {
      fixture,
      classification: 'UNEXPECTED_ERROR',
      actualErrorCode,
      reason:
        fixture.classification === 'EXPECTED_VALIDATION_ERROR'
          ? `Se esperaba ${fixture.expectedErrorCode} y se obtuvo ${actualErrorCode}.`
          : `Error inesperado: ${actualErrorCode}.`,
    };
  }
}

export function executeLineTaxMatrix(): FixtureExecution[] {
  return LINE_TAX_COMPARISON_FIXTURES.map(executeLineTaxFixture);
}

export function evaluateLineTaxGate(
  executions: FixtureExecution[],
): 'DETENER' | 'APROBABLE_PARA_REVISION' {
  const mustStop = executions.some((execution) => {
    if (!execution.classification) return true;
    if (execution.classification === 'UNEXPECTED_ERROR') return true;
    if (execution.classification !== 'COMPARABLE') return false;
    const difference = execution.comparison?.difference;
    return (
      !difference ||
      !difference.subtotal.eq(0) ||
      !difference.vat.eq(0) ||
      !difference.impoconsumo.eq(0) ||
      !difference.grossTotal.eq(0)
    );
  });
  return mustStop ? 'DETENER' : 'APROBABLE_PARA_REVISION';
}
