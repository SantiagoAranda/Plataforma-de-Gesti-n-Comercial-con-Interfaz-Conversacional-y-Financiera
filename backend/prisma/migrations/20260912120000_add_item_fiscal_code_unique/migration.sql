-- Existing codes are not rewritten. Stop here instead of silently accepting
-- semantic duplicates such as "abc-001" and "ABC-001".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Item"
    WHERE "fiscalCode" IS NOT NULL
    GROUP BY "businessId", UPPER(BTRIM("fiscalCode"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add fiscalCode uniqueness: normalized duplicates exist in Item';
  END IF;
END $$;

CREATE UNIQUE INDEX "Item_businessId_fiscalCode_key"
ON "Item"("businessId", "fiscalCode");
