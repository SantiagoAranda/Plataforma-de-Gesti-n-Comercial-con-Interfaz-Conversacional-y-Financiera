import type { Ingredient, IngredientUnit, UnitCode } from "@/src/services/inventory";

export const INGREDIENT_UNIT_OPTIONS: Array<{ value: UnitCode; label: string }> = [
  { value: "UNIT", label: "Unidad" },
  { value: "PACKAGE", label: "Paquete" },
  { value: "DOZEN", label: "Docena" },
  { value: "SIX_PACK", label: "Six-pack" },
  { value: "BOX", label: "Caja" },
  { value: "BAG", label: "Bolsa" },
  { value: "BUCKET", label: "Balde" },
  { value: "BULTO", label: "Bulto" },
  { value: "BOTTLE", label: "Botella" },
  { value: "GARRAFA", label: "Garrafa" },
  { value: "BIDON", label: "Bidón" },
  { value: "ROLL", label: "Rollo" },
  { value: "G", label: "Gramo (g)" },
  { value: "KG", label: "Kilogramo (kg)" },
  { value: "LB", label: "Libra (lb)" },
  { value: "ML", label: "Mililitro (ml)" },
  { value: "L", label: "Litro (L)" },
  { value: "CM", label: "Centímetro (cm)" },
  { value: "M", label: "Metro (m)" },
];

const SHORT_LABELS: Record<string, string> = {
  UNIT: "u",
  PACKAGE: "paquete",
  DOZEN: "docena",
  SIX_PACK: "six-pack",
  BOX: "caja",
  BAG: "bolsa",
  BUCKET: "balde",
  BULTO: "bulto",
  BOTTLE: "botella",
  GARRAFA: "garrafa",
  BIDON: "bidón",
  ROLL: "rollo",
  G: "g",
  KG: "kg",
  LB: "lb",
  ML: "ml",
  L: "L",
  CM: "cm",
  M: "m",
};

export function formatUnit(unit?: IngredientUnit | string | null) {
  if (!unit) return "";
  return SHORT_LABELS[String(unit)] ?? String(unit).toLowerCase();
}

export function formatIngredientUnit(ingredient: Pick<Ingredient, "consumptionUnit">) {
  return formatUnit(ingredient.consumptionUnit);
}
