import type { Ingredient, IngredientUnit } from "@/src/services/inventory";

export const INGREDIENT_UNIT_OPTIONS: Array<{ value: IngredientUnit; label: string }> = [
  { value: "UNIT", label: "Unidad" },
  { value: "PACKAGE", label: "Paquete" },
  { value: "DOZEN", label: "Docena" },
  { value: "BOX", label: "Caja" },
  { value: "G", label: "Gramo (g)" },
  { value: "KG", label: "Kilogramo (kg)" },
  { value: "LB", label: "Libra (lb)" },
  { value: "ML", label: "Mililitro (ml)" },
  { value: "L", label: "Litro (l)" },
];

const SHORT_LABELS: Record<IngredientUnit, string> = {
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

export function formatUnit(unit?: IngredientUnit | string | null) {
  if (!unit) return "";
  return SHORT_LABELS[unit as IngredientUnit] ?? String(unit).toLowerCase();
}

export function formatIngredientUnit(ingredient: Pick<Ingredient, "consumptionUnit">) {
  return formatUnit(ingredient.consumptionUnit);
}
