ALTER TABLE "AccountingMovement"
ADD COLUMN "accountingRole" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AccountingMovement"
    WHERE "accountingRole" IS NOT NULL
    GROUP BY "businessId", "originType", "originId", "accountingRole"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create payroll accounting role uniqueness: repeated accountingRole exists for an origin';
  END IF;
END $$;

CREATE UNIQUE INDEX "AccountingMovement_origin_role_unique"
ON "AccountingMovement" ("businessId", "originType", "originId", "accountingRole")
WHERE "accountingRole" IS NOT NULL;
