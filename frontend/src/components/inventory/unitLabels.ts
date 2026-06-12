import type { Ingredient, IngredientUnit } from "@/src/services/inventory";

export const INGREDIENT_UNIT_OPTIONS: Array<{ value: IngredientUnit; label: string }> = [
  { value: "UNIT", label: "Unidad" },
  { value: "G", label: "Gramo (g)" },
  { value: "KG", label: "Kilogramo (kg)" },
  { value: "ML", label: "Mililitro (ml)" },
  { value: "L", label: "Litro (l)" },
];

const SHORT_LABELS: Record<IngredientUnit, string> = {
  UNIT: "u",
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "l",
};

export function formatUnit(unit?: IngredientUnit | string | null) {
  if (!unit) return "";
  return SHORT_LABELS[unit as IngredientUnit] ?? String(unit).toLowerCase();
}

export function formatIngredientUnit(ingredient: Pick<Ingredient, "consumptionUnit" | "customUnitLabel">) {
  return ingredient.customUnitLabel?.trim() || formatUnit(ingredient.consumptionUnit);
}

export function getPurchaseToStockFactor(
  purchaseUnit?: IngredientUnit | string | null,
  stockUnit?: IngredientUnit | string | null,
  customFactor?: string | number | null,
) {
  const parsedCustom =
    customFactor === null || customFactor === undefined || customFactor === ""
      ? 1
      : Number(customFactor);
  if (!purchaseUnit || !stockUnit) return parsedCustom;
  if (purchaseUnit === stockUnit) return parsedCustom;

  const standardFactors: Record<string, number> = {
    "KG:G": 1000,
    "G:KG": 0.001,
    "L:ML": 1000,
    "ML:L": 0.001,
  };

  const standard = standardFactors[`${purchaseUnit}:${stockUnit}`];
  if (standard) return standard;

  return parsedCustom;
}
