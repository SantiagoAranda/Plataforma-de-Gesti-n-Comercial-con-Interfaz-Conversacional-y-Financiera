-- Abort before changing constraints when current ingredient names would collide
-- under the new trim + case-insensitive operational uniqueness rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Ingredient"
    GROUP BY "businessId", lower(btrim("name"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create current ingredient name index: duplicate normalized names exist';
  END IF;
END $$;

ALTER TABLE "Ingredient" ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX "Ingredient_businessId_name_key";

CREATE UNIQUE INDEX "Ingredient_businessId_normalized_current_name_key"
ON "Ingredient" ("businessId", lower(btrim("name")))
WHERE "deletedAt" IS NULL;

CREATE INDEX "Ingredient_businessId_deletedAt_idx"
ON "Ingredient" ("businessId", "deletedAt");

-- Rollback safety:
-- Do not recreate Ingredient_businessId_name_key or drop deletedAt until writes
-- are stopped and names reused after soft deletion have been audited/resolved.
-- Reinstating the former unique constraint automatically can fail or collapse
-- distinct historical identities that intentionally share a visible name.
