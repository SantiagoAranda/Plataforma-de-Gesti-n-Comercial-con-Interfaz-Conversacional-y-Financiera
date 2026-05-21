import { IngredientUnit } from '@prisma/client';

export function normalizeIngredientUnit(value: unknown): IngredientUnit | unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['g', 'gr', 'gramo', 'gramos'].includes(normalized)) return IngredientUnit.G;
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(normalized)) return IngredientUnit.KG;
  if (normalized === 'ml') return IngredientUnit.ML;
  if (['l', 'lt', 'litro', 'litros'].includes(normalized)) return IngredientUnit.L;
  if (['u', 'unidad', 'unidades', 'unit'].includes(normalized)) return IngredientUnit.UNIT;

  const upper = value.trim().toUpperCase();
  if (Object.values(IngredientUnit).includes(upper as IngredientUnit)) {
    return upper as IngredientUnit;
  }

  return value;
}
