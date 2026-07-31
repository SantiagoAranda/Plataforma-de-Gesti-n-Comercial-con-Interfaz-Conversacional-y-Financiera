import { ItemTaxTreatment, Prisma } from '@prisma/client';

export type ItemFiscalConfiguration = {
  taxTreatment: ItemTaxTreatment;
  vatRate: Prisma.Decimal | number | string | null;
  appliesImpoconsumo: boolean;
  impoconsumoRate: Prisma.Decimal | number | string | null;
};

export type ItemFiscalValidationError = {
  code:
    | 'TAXED_ZERO_VAT_RATE'
    | 'VAT_RATE_NOT_ALLOWED'
    | 'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT'
    | 'IMPOCONSUMO_FORBIDS_VAT_RATE'
    | 'INVALID_IMPOCONSUMO_RATE';
  message: string;
};

const decimalOrNull = (
  value: Prisma.Decimal | number | string | null,
): Prisma.Decimal | null => (value === null ? null : new Prisma.Decimal(value));

export function validateItemFiscalConfiguration(
  input: ItemFiscalConfiguration,
): ItemFiscalValidationError | null {
  const vatRate = decimalOrNull(input.vatRate);
  const impoconsumoRate = decimalOrNull(input.impoconsumoRate);

  if (vatRate !== null && (vatRate.lt(0) || vatRate.gt(1))) {
    return {
      code: 'VAT_RATE_NOT_ALLOWED',
      message: 'La tarifa de IVA debe estar entre cero y uno.',
    };
  }

  if (input.taxTreatment === ItemTaxTreatment.TAXED) {
    if (vatRate?.eq(0)) {
      return {
        code: 'TAXED_ZERO_VAT_RATE',
        message: 'Un ítem gravado no admite una tarifa de IVA explícita igual a cero.',
      };
    }
  } else if (
    input.taxTreatment === ItemTaxTreatment.EXEMPT &&
    vatRate !== null &&
    !vatRate.eq(0)
  ) {
    return {
      code: 'VAT_RATE_NOT_ALLOWED',
      message: 'Un ítem exento solo admite una tarifa de IVA nula o igual a cero.',
    };
  } else if (
    (input.taxTreatment === ItemTaxTreatment.EXCLUDED ||
      input.taxTreatment === ItemTaxTreatment.NOT_TAXED) &&
    vatRate !== null
  ) {
    return {
      code: 'VAT_RATE_NOT_ALLOWED',
      message: 'El tratamiento tributario seleccionado no admite tarifa de IVA.',
    };
  }

  if (input.appliesImpoconsumo) {
    if (input.taxTreatment !== ItemTaxTreatment.TAXED) {
      return {
        code: 'IMPOCONSUMO_REQUIRES_TAXED_TREATMENT',
        message: 'El impoconsumo requiere tratamiento tributario gravado.',
      };
    }
    if (vatRate !== null) {
      return {
        code: 'IMPOCONSUMO_FORBIDS_VAT_RATE',
        message: 'Un ítem con impoconsumo no puede tener una tarifa de IVA configurada.',
      };
    }
    if (
      impoconsumoRate !== null &&
      (impoconsumoRate.lte(0) || impoconsumoRate.gt(1))
    ) {
      return {
        code: 'INVALID_IMPOCONSUMO_RATE',
        message: 'La tarifa de impoconsumo debe ser mayor que cero y menor o igual que uno.',
      };
    }
  }

  return null;
}
