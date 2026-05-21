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
