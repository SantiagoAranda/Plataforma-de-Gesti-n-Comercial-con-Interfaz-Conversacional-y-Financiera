import type {
  IngredientPurchasePresentation,
  Unit,
  UnitConversion,
} from "@/src/services/inventory";

export const DECIMAL_INPUT_PATTERN = /^\d+(\.\d{1,6})?$/;

export function normalizeDecimal(value: string) {
  return value.trim().replace(",", ".");
}

export function positiveDecimal(value: string) {
  const normalized = normalizeDecimal(value);
  return DECIMAL_INPUT_PATTERN.test(normalized) && Number(normalized) > 0;
}

export function directConversionFactor(
  fromUnitId: string,
  toUnitId: string,
  conversions: UnitConversion[],
) {
  if (!fromUnitId || !toUnitId) return null;
  if (fromUnitId === toUnitId) return 1;
  const conversion = conversions.find(
    (candidate) =>
      candidate.fromUnitId === fromUnitId && candidate.toUnitId === toUnitId,
  );
  const factor = Number(conversion?.factor);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function presentationFactorFromFields(
  innerQuantity: string,
  contentQuantity: string,
  contentUnitId: string,
  stockUnitId: string,
  conversions: UnitConversion[],
) {
  if (!positiveDecimal(innerQuantity) || !positiveDecimal(contentQuantity))
    return null;
  const conversionFactor = directConversionFactor(
    contentUnitId,
    stockUnitId,
    conversions,
  );
  if (conversionFactor === null) return null;
  const factor =
    Number(normalizeDecimal(innerQuantity)) *
    Number(normalizeDecimal(contentQuantity)) *
    conversionFactor;
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function presentationFactor(
  presentation: IngredientPurchasePresentation,
) {
  const factor = Number(presentation.factorToBaseUnit);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 6,
  }).format(value);
}

export function decimalPayload(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(6).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function presentationComposition(
  presentation: IngredientPurchasePresentation,
  stockUnit?: Unit | null,
) {
  const purchaseLabel =
    presentation.purchaseUnitLabel ||
    presentation.purchaseUnit?.symbol ||
    presentation.purchaseUnit?.name ||
    presentation.name;
  const innerLabel = presentation.innerUnitLabel?.trim() || "unidades";
  const contentLabel =
    presentation.contentUnit?.symbol || presentation.contentUnit?.name || "";
  const stockLabel = stockUnit?.symbol || stockUnit?.name || "";
  const factor = presentationFactor(presentation);
  return {
    purchaseLabel,
    factor,
    detail: `${presentation.innerQuantity} ${innerLabel} × ${presentation.contentQuantity} ${contentLabel}`,
    formula:
      factor === null
        ? null
        : `1 ${purchaseLabel} = ${presentation.innerQuantity} ${innerLabel} × ${presentation.contentQuantity} ${contentLabel} = ${formatQuantity(factor)} ${stockLabel}`,
  };
}
