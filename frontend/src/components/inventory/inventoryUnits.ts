import type {
  Ingredient,
  InventorySummaryIngredient,
  Unit,
} from "@/src/services/inventory";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";

type IngredientLike = Partial<Ingredient | InventorySummaryIngredient> & {
  stockUnit?: Unit | null;
};

export type UnitConversionLike = {
  fromUnitId?: string;
  toUnitId?: string;
  fromUnit?: Unit;
  toUnit?: Unit;
  factor: string | number;
};

const UNIT_SYMBOLS: Record<string, string> = {
  UNIT: "u",
  PACKAGE: "paquete",
  DOZEN: "docena",
  BOX: "caja",
  G: "g",
  KG: "kg",
  LB: "lb",
  ML: "ml",
  L: "l",
};

function unitCode(unit?: Unit | string | null) {
  if (!unit) return "";
  return typeof unit === "string" ? unit : unit.code;
}

export function formatUnitSymbol(unit?: Unit | string | null) {
  if (!unit) return "";
  if (typeof unit !== "string") return unit.symbol;
  return UNIT_SYMBOLS[unit] ?? unit.toLowerCase();
}

export function getStockUnitSymbol(ingredient: IngredientLike) {
  return ingredient.stockUnit?.symbol ?? formatUnitSymbol(ingredient.consumptionUnit ?? null);
}

export function getStockUnitLabel(ingredient: IngredientLike) {
  return ingredient.stockUnit?.name ?? getStockUnitSymbol(ingredient);
}

export function formatStockHeader(ingredient: IngredientLike) {
  const unit = getStockUnitSymbol(ingredient);
  const stock = parseNumber(ingredient.currentStock ?? 0);
  const averageCost = parseNumber(ingredient.averageCost ?? 0);
  const minStock = parseNumber(ingredient.minStock ?? 0);

  return {
    unit,
    stockText: `${formatMoney(stock)} ${unit}`,
    averageCostText: `$${formatMoney(averageCost)}/${unit}`,
    minStockText: `${formatMoney(minStock)} ${unit}`,
  };
}

/**
 * Find the conversion factor between two units.
 * Checks the explicit conversions array first (loaded from API), then falls
 * back to hard-coded identity conversions for display purposes.
 */
function findConversionFactor(
  fromUnit: Unit | string | null | undefined,
  toUnit: Unit | string | null | undefined,
  conversions?: UnitConversionLike[],
) {
  const fromCode = unitCode(fromUnit);
  const toCode = unitCode(toUnit);
  if (!fromCode || !toCode) return null;

  const fromId = typeof fromUnit === "string" ? undefined : fromUnit?.id;
  const toId = typeof toUnit === "string" ? undefined : toUnit?.id;

  const explicit = conversions?.find((conversion) => {
    const conversionFromCode = conversion.fromUnit?.code;
    const conversionToCode = conversion.toUnit?.code;
    return (
      (fromId && toId && conversion.fromUnitId === fromId && conversion.toUnitId === toId) ||
      (conversionFromCode === fromCode && conversionToCode === toCode)
    );
  });

  if (explicit) {
    const factor = Number(explicit.factor);
    return Number.isFinite(factor) && factor > 0 ? factor : null;
  }

  // Identity fallback for same-code conversions
  if (fromCode === toCode) return 1;

  return null;
}

export function getSystemConversionFactor(fromUnitCode?: string | null, toUnitCode?: string | null) {
  if (!fromUnitCode || !toUnitCode) return null;
  if (fromUnitCode === toUnitCode) return 1;
  return null;
}

/**
 * Compute a purchase preview for standard unit purchases (unit → stock).
 * Uses the global UnitConversion table via the `conversions` array.
 */
export function getStandardPurchasePreview({
  ingredient,
  purchaseUnit,
  quantity,
  unitCost,
  conversions,
}: {
  ingredient: IngredientLike;
  purchaseUnit?: Unit | null;
  quantity: string | number;
  unitCost: string | number;
  conversions?: UnitConversionLike[];
}) {
  const stockUnit = ingredient.stockUnit ?? null;
  const factor = findConversionFactor(purchaseUnit, stockUnit, conversions);
  const purchaseQuantity = parseNumber(quantity);
  const purchaseUnitCost = parseNumber(unitCost);
  const stockUnitSymbol = getStockUnitSymbol(ingredient);
  const purchaseUnitSymbol = purchaseUnit?.symbol ?? "";

  if (!factor || !purchaseUnit || !stockUnit) {
    return {
      valid: false,
      lines: ["No hay conversión configurada para esta compra."],
      stockQuantityAdded: null,
      baseUnitCost: null,
    };
  }

  const stockQuantityAdded = purchaseQuantity > 0 ? purchaseQuantity * factor : null;
  const baseUnitCost = purchaseUnitCost > 0 ? purchaseUnitCost / factor : null;

  return {
    valid: true,
    factor,
    stockQuantityAdded,
    baseUnitCost,
    purchaseUnitLabel: purchaseUnitSymbol,
    stockUnitLabel: stockUnitSymbol,
    lines: [
      `1 ${purchaseUnitSymbol} = ${formatMoney(factor)} ${stockUnitSymbol}`,
      stockQuantityAdded !== null ? `Ingresan: ${formatMoney(stockQuantityAdded)} ${stockUnitSymbol}` : null,
      baseUnitCost !== null ? `Costo base: $${formatMoney(baseUnitCost)}/${stockUnitSymbol}` : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

/**
 * Display helpers for recipe consumption lines.
 */
export function getRecipeDisplayQuantity({
  ingredient,
  quantityRequired,
}: {
  ingredient: IngredientLike;
  quantityRequired: string | number;
}) {
  return parseNumber(quantityRequired);
}

export function formatRecipeConsumption({
  ingredient,
  quantityRequired,
}: {
  ingredient: IngredientLike;
  quantityRequired: string | number;
}) {
  const stockUnitSymbol = getStockUnitSymbol(ingredient);
  const baseQuantity = parseNumber(quantityRequired);
  const averageCost = parseNumber(ingredient.averageCost ?? 0);
  const currentStock = parseNumber(ingredient.currentStock ?? 0);
  const possibleUnits = baseQuantity > 0 ? Math.floor(currentStock / baseQuantity) : 0;

  return {
    displayQuantity: baseQuantity,
    displayUnit: stockUnitSymbol,
    baseQuantity,
    stockUnitSymbol,
    averageCost,
    costPerProduct: baseQuantity * averageCost,
    currentStock,
    possibleUnits,
    lines: [
      `Consumo por unidad: ${formatMoney(baseQuantity)} ${stockUnitSymbol}`,
      `Costo unitario insumo: $${formatMoney(averageCost)}/${stockUnitSymbol}`,
      `Costo por producto: $${formatMoney(baseQuantity * averageCost)}`,
      `Stock disponible: ${formatMoney(currentStock)} ${stockUnitSymbol}`,
      `Producción posible: ${possibleUnits} unidades`,
    ].filter((line): line is string => Boolean(line)),
  };
}
