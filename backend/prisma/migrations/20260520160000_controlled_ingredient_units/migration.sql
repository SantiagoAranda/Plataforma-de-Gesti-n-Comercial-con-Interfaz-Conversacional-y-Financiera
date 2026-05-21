-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('UNIT', 'G', 'KG', 'ML', 'L');

-- Preserve unknown legacy unit labels before converting columns to controlled units.
ALTER TABLE "Ingredient" ADD COLUMN "customUnitLabel" TEXT;

UPDATE "Ingredient"
SET "customUnitLabel" = COALESCE(
  CASE
    WHEN LOWER(TRIM("consumptionUnit")) NOT IN (
      'g', 'gr', 'gramo', 'gramos',
      'kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos',
      'ml',
      'l', 'lt', 'litro', 'litros',
      'u', 'unidad', 'unidades'
    ) THEN NULLIF(TRIM("consumptionUnit"), '')
  END,
  CASE
    WHEN LOWER(TRIM("purchaseUnit")) NOT IN (
      'g', 'gr', 'gramo', 'gramos',
      'kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos',
      'ml',
      'l', 'lt', 'litro', 'litros',
      'u', 'unidad', 'unidades'
    ) THEN NULLIF(TRIM("purchaseUnit"), '')
  END
);

ALTER TABLE "Ingredient"
ALTER COLUMN "consumptionUnit" TYPE "IngredientUnit"
USING (
  CASE
    WHEN LOWER(TRIM("consumptionUnit")) IN ('g', 'gr', 'gramo', 'gramos') THEN 'G'
    WHEN LOWER(TRIM("consumptionUnit")) IN ('kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos') THEN 'KG'
    WHEN LOWER(TRIM("consumptionUnit")) IN ('ml') THEN 'ML'
    WHEN LOWER(TRIM("consumptionUnit")) IN ('l', 'lt', 'litro', 'litros') THEN 'L'
    WHEN LOWER(TRIM("consumptionUnit")) IN ('u', 'unidad', 'unidades') THEN 'UNIT'
    ELSE 'UNIT'
  END
)::"IngredientUnit";

ALTER TABLE "Ingredient"
ALTER COLUMN "purchaseUnit" TYPE "IngredientUnit"
USING (
  CASE
    WHEN LOWER(TRIM("purchaseUnit")) IN ('g', 'gr', 'gramo', 'gramos') THEN 'G'
    WHEN LOWER(TRIM("purchaseUnit")) IN ('kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos') THEN 'KG'
    WHEN LOWER(TRIM("purchaseUnit")) IN ('ml') THEN 'ML'
    WHEN LOWER(TRIM("purchaseUnit")) IN ('l', 'lt', 'litro', 'litros') THEN 'L'
    WHEN LOWER(TRIM("purchaseUnit")) IN ('u', 'unidad', 'unidades') THEN 'UNIT'
    ELSE 'UNIT'
  END
)::"IngredientUnit";
