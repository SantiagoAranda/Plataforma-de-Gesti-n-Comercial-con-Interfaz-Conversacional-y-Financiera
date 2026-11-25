-- Informative termination reason for contract settlements. It never changes
-- settlement amounts, concepts or accounting.
CREATE TYPE "PayrollTerminationReason" AS ENUM (
  'CONTRACT_EXPIRATION',
  'VOLUNTARY_RESIGNATION',
  'EMPLOYER_TERMINATION',
  'MUTUAL_AGREEMENT',
  'OTHER'
);

ALTER TABLE "PayrollContractSettlement"
ADD COLUMN "terminationReason" "PayrollTerminationReason",
ADD COLUMN "terminationNote" TEXT;

-- Historical rows are never modified: abort if duplicates already exist so they
-- can be reviewed manually before the constraint is applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PayrollContractSettlement"
    WHERE "type" = 'REAL_TERMINATION'
      AND "status" IN ('CALCULATED', 'POSTED')
    GROUP BY "contractId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create settlement uniqueness: a contract already has more than one real termination settlement';
  END IF;
END $$;

-- One definitive (CALCULATED/POSTED) real termination per contract, also under
-- concurrent requests.
CREATE UNIQUE INDEX "PayrollContractSettlement_real_termination_contract_key"
ON "PayrollContractSettlement" ("contractId")
WHERE "type" = 'REAL_TERMINATION' AND "status" IN ('CALCULATED', 'POSTED');
