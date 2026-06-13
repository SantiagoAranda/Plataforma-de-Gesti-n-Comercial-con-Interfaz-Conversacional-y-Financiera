CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('WEIGHT', 'VOLUME', 'COUNT', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "InventoryPurchaseMode" AS ENUM ('STANDARD', 'PRESENTATION', 'LEGACY');

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" "UnitKind" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConversion" (
    "id" TEXT NOT NULL,
    "fromUnitId" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "factor" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientPurchasePresentation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchaseUnitId" TEXT NOT NULL,
    "innerQuantity" DECIMAL(18,6) NOT NULL,
    "innerUnitLabel" TEXT,
    "contentQuantity" DECIMAL(18,6) NOT NULL,
    "contentUnitId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientPurchasePresentation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "stockUnitId" TEXT;
ALTER TABLE "Ingredient" ADD COLUMN "defaultPurchaseUnitId" TEXT;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseMode" "InventoryPurchaseMode";
ALTER TABLE "InventoryMovement" ADD COLUMN "purchasePresentationId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseQuantity" DECIMAL(20,6);
ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseUnitLabel" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "conversionDetail" TEXT;

-- Indexes
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");
CREATE INDEX "Unit_kind_idx" ON "Unit"("kind");
CREATE INDEX "Unit_isActive_idx" ON "Unit"("isActive");

CREATE UNIQUE INDEX "UnitConversion_fromUnitId_toUnitId_key" ON "UnitConversion"("fromUnitId", "toUnitId");
CREATE INDEX "UnitConversion_fromUnitId_idx" ON "UnitConversion"("fromUnitId");
CREATE INDEX "UnitConversion_toUnitId_idx" ON "UnitConversion"("toUnitId");

CREATE INDEX "Ingredient_stockUnitId_idx" ON "Ingredient"("stockUnitId");
CREATE INDEX "Ingredient_defaultPurchaseUnitId_idx" ON "Ingredient"("defaultPurchaseUnitId");

CREATE INDEX "IngredientPurchasePresentation_businessId_idx" ON "IngredientPurchasePresentation"("businessId");
CREATE INDEX "IngredientPurchasePresentation_businessId_ingredientId_idx" ON "IngredientPurchasePresentation"("businessId", "ingredientId");
CREATE INDEX "IngredientPurchasePresentation_purchaseUnitId_idx" ON "IngredientPurchasePresentation"("purchaseUnitId");
CREATE INDEX "IngredientPurchasePresentation_contentUnitId_idx" ON "IngredientPurchasePresentation"("contentUnitId");
CREATE UNIQUE INDEX "IngredientPurchasePresentation_one_default_active"
  ON "IngredientPurchasePresentation"("businessId", "ingredientId")
  WHERE "isDefault" = true AND "isActive" = true;

CREATE INDEX "InventoryMovement_purchasePresentationId_idx" ON "InventoryMovement"("purchasePresentationId");
CREATE INDEX "InventoryMovement_purchaseMode_idx" ON "InventoryMovement"("purchaseMode");

-- ForeignKeys
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_stockUnitId_fkey" FOREIGN KEY ("stockUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_defaultPurchaseUnitId_fkey" FOREIGN KEY ("defaultPurchaseUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_ingredientId_businessId_fkey" FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_purchaseUnitId_fkey" FOREIGN KEY ("purchaseUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_contentUnitId_fkey" FOREIGN KEY ("contentUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchasePresentationId_fkey" FOREIGN KEY ("purchasePresentationId") REFERENCES "IngredientPurchasePresentation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Check constraints
ALTER TABLE "UnitConversion" ADD CONSTRAINT "UnitConversion_factor_positive" CHECK ("factor" > 0);
ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_innerQuantity_positive" CHECK ("innerQuantity" > 0);
ALTER TABLE "IngredientPurchasePresentation" ADD CONSTRAINT "IngredientPurchasePresentation_contentQuantity_positive" CHECK ("contentQuantity" > 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseQuantity_positive" CHECK ("purchaseQuantity" IS NULL OR "purchaseQuantity" > 0);

CREATE OR REPLACE FUNCTION reject_commercial_unit_conversion()
RETURNS trigger AS $$
DECLARE
  from_kind "UnitKind";
  to_kind "UnitKind";
  from_code TEXT;
  to_code TEXT;
BEGIN
  SELECT "kind", "code" INTO from_kind, from_code FROM "Unit" WHERE "id" = NEW."fromUnitId";
  SELECT "kind", "code" INTO to_kind, to_code FROM "Unit" WHERE "id" = NEW."toUnitId";

  IF from_kind = 'COMMERCIAL' OR to_kind = 'COMMERCIAL' THEN
    RAISE EXCEPTION 'UnitConversion cannot use legacy COMMERCIAL units';
  END IF;

  IF from_kind = 'COUNT' AND to_kind <> 'COUNT' THEN
    RAISE EXCEPTION 'COUNT units can only convert to COUNT units';
  END IF;

  IF from_kind = 'COUNT'
     AND from_code <> to_code
     AND NOT (to_code = 'UNIT' AND from_code IN ('PACKAGE', 'DOZEN', 'BOX')) THEN
    RAISE EXCEPTION 'Only PACKAGE, DOZEN, and BOX can convert to UNIT';
  END IF;

  IF from_kind = 'WEIGHT' AND to_kind <> 'WEIGHT' THEN
    RAISE EXCEPTION 'WEIGHT units can only convert to WEIGHT units';
  END IF;

  IF from_kind = 'VOLUME' AND to_kind <> 'VOLUME' THEN
    RAISE EXCEPTION 'VOLUME units can only convert to VOLUME units';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitConversion_no_commercial_units"
BEFORE INSERT OR UPDATE ON "UnitConversion"
FOR EACH ROW EXECUTE FUNCTION reject_commercial_unit_conversion();

CREATE OR REPLACE FUNCTION validate_purchase_presentation_units()
RETURNS trigger AS $$
DECLARE
  purchase_kind "UnitKind";
  content_kind "UnitKind";
BEGIN
  SELECT "kind" INTO purchase_kind FROM "Unit" WHERE "id" = NEW."purchaseUnitId";
  SELECT "kind" INTO content_kind FROM "Unit" WHERE "id" = NEW."contentUnitId";

  IF purchase_kind <> 'COMMERCIAL' THEN
    RAISE EXCEPTION 'purchaseUnitId must reference a COMMERCIAL unit';
  END IF;

  IF content_kind = 'COMMERCIAL' THEN
    RAISE EXCEPTION 'contentUnitId cannot reference a COMMERCIAL unit';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "IngredientPurchasePresentation_valid_units"
BEFORE INSERT OR UPDATE ON "IngredientPurchasePresentation"
FOR EACH ROW EXECUTE FUNCTION validate_purchase_presentation_units();

-- Seed Units
INSERT INTO "Unit" ("id", "code", "name", "symbol", "kind", "isSystem", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'KG', 'Kilogramo', 'kg', 'WEIGHT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'G', 'Gramo', 'g', 'WEIGHT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'L', 'Litro', 'l', 'VOLUME', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ML', 'Mililitro', 'ml', 'VOLUME', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'UNIT', 'Unidad', 'u', 'COUNT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LB', 'Libra', 'lb', 'WEIGHT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BOX', 'Caja', 'caja', 'COUNT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DOZEN', 'Docena', 'docena', 'COUNT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PACKAGE', 'Paquete', 'paquete', 'COUNT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PACK', 'Pack', 'pack', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BAG', 'Bolsa', 'bolsa', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'TRAY', 'Bandeja', 'bandeja', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "symbol" = EXCLUDED."symbol",
  "kind" = EXCLUDED."kind",
  "isSystem" = EXCLUDED."isSystem",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Seed global conversions. Legacy COMMERCIAL units intentionally excluded.
INSERT INTO "UnitConversion" ("id", "fromUnitId", "toUnitId", "factor", "updatedAt")
SELECT gen_random_uuid()::text, f."id", t."id", v."factor"::DECIMAL(20,6), CURRENT_TIMESTAMP
FROM (VALUES
  ('KG', 'G', '1000'),
  ('G', 'KG', '0.001'),
  ('LB', 'G', '500'),
  ('L', 'ML', '1000'),
  ('ML', 'L', '0.001'),
  ('KG', 'KG', '1'),
  ('LB', 'LB', '1'),
  ('G', 'G', '1'),
  ('L', 'L', '1'),
  ('ML', 'ML', '1'),
  ('UNIT', 'UNIT', '1'),
  ('PACKAGE', 'PACKAGE', '1'),
  ('DOZEN', 'DOZEN', '1'),
  ('BOX', 'BOX', '1'),
  ('PACKAGE', 'UNIT', '6'),
  ('DOZEN', 'UNIT', '12'),
  ('BOX', 'UNIT', '24')
) AS v("fromCode", "toCode", "factor")
JOIN "Unit" f ON f."code" = v."fromCode"
JOIN "Unit" t ON t."code" = v."toCode"
ON CONFLICT ("fromUnitId", "toUnitId") DO UPDATE SET
  "factor" = EXCLUDED."factor",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Backfill ingredients from legacy enum fields.
UPDATE "Ingredient" i
SET
  "stockUnitId" = su."id",
  "defaultPurchaseUnitId" = pu."id"
FROM "Unit" su, "Unit" pu
WHERE su."code" = i."consumptionUnit"::text
  AND pu."code" = i."purchaseUnit"::text
  AND i."stockUnitId" IS NULL
  AND i."defaultPurchaseUnitId" IS NULL;

-- Mark old movements as LEGACY without recalculating quantity/cost.
UPDATE "InventoryMovement"
SET "purchaseMode" = 'LEGACY'
WHERE "purchaseMode" IS NULL
  AND "type" = 'PURCHASE'
  AND "ingredientId" IS NOT NULL;
