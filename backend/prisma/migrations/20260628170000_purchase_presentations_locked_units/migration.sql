INSERT INTO "Unit" ("id", "code", "name", "symbol", "kind", "isSystem", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CM', 'Centimetro', 'cm', 'LENGTH', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'M', 'Metro', 'm', 'LENGTH', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SIX_PACK', 'Six-pack', 'six-pack', 'COUNT', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BAG', 'Bolsa', 'bolsa', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BUCKET', 'Balde', 'balde', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BULTO', 'Bulto', 'bulto', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BOTTLE', 'Botella', 'botella', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GARRAFA', 'Garrafa', 'garrafa', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BIDON', 'Bidon', 'bidon', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ROLL', 'Rollo', 'rollo', 'COMMERCIAL', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "symbol" = EXCLUDED."symbol",
  "kind" = EXCLUDED."kind",
  "isSystem" = EXCLUDED."isSystem",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Unit"
SET "kind" = 'COMMERCIAL', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('PACKAGE', 'BOX');

UPDATE "Ingredient" i
SET
  "defaultPurchaseUnitId" = i."stockUnitId",
  "purchaseUnit" = i."consumptionUnit",
  "purchaseToConsumptionFactor" = 1
FROM "Unit" pu
WHERE i."defaultPurchaseUnitId" = pu."id"
  AND pu."code" IN ('PACKAGE', 'BOX')
  AND i."stockUnitId" IS NOT NULL;

DELETE FROM "UnitConversion"
WHERE "fromUnitId" IN (SELECT "id" FROM "Unit" WHERE "code" IN ('PACKAGE', 'BOX'))
   OR "toUnitId" IN (SELECT "id" FROM "Unit" WHERE "code" IN ('PACKAGE', 'BOX'));

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
    RAISE EXCEPTION 'UnitConversion cannot use COMMERCIAL units';
  END IF;

  IF from_kind = 'COUNT' AND to_kind <> 'COUNT' THEN
    RAISE EXCEPTION 'COUNT units can only convert to COUNT units';
  END IF;

  IF from_kind = 'COUNT'
     AND from_code <> to_code
     AND NOT (to_code = 'UNIT' AND from_code IN ('DOZEN', 'SIX_PACK')) THEN
    RAISE EXCEPTION 'Only DOZEN and SIX_PACK can convert to UNIT';
  END IF;

  IF from_kind = 'WEIGHT' AND to_kind <> 'WEIGHT' THEN
    RAISE EXCEPTION 'WEIGHT units can only convert to WEIGHT units';
  END IF;

  IF from_kind = 'VOLUME' AND to_kind <> 'VOLUME' THEN
    RAISE EXCEPTION 'VOLUME units can only convert to VOLUME units';
  END IF;

  IF from_kind = 'LENGTH' AND to_kind <> 'LENGTH' THEN
    RAISE EXCEPTION 'LENGTH units can only convert to LENGTH units';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO "UnitConversion" ("id", "fromUnitId", "toUnitId", "factor", "updatedAt")
SELECT gen_random_uuid()::text, f."id", t."id", v."factor"::DECIMAL(20,6), CURRENT_TIMESTAMP
FROM (VALUES
  ('KG', 'G', '1000'),
  ('G', 'KG', '0.001'),
  ('L', 'ML', '1000'),
  ('ML', 'L', '0.001'),
  ('M', 'CM', '100'),
  ('CM', 'M', '0.01'),
  ('DOZEN', 'UNIT', '12'),
  ('SIX_PACK', 'UNIT', '6'),
  ('KG', 'KG', '1'),
  ('G', 'G', '1'),
  ('L', 'L', '1'),
  ('ML', 'ML', '1'),
  ('M', 'M', '1'),
  ('CM', 'CM', '1'),
  ('UNIT', 'UNIT', '1'),
  ('DOZEN', 'DOZEN', '1'),
  ('SIX_PACK', 'SIX_PACK', '1')
) AS v("fromCode", "toCode", "factor")
JOIN "Unit" f ON f."code" = v."fromCode"
JOIN "Unit" t ON t."code" = v."toCode"
ON CONFLICT ("fromUnitId", "toUnitId") DO UPDATE SET
  "factor" = EXCLUDED."factor",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "factorToBaseUnitSnapshot" DECIMAL(20,6);
