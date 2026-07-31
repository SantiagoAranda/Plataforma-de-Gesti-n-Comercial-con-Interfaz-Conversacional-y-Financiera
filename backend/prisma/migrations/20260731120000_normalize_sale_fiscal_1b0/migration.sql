-- Etapa 1B-0: structural normalization only.
-- AGGREGATE_V1 remains the sole operational calculation method.

CREATE TYPE "FiscalSourceType" AS ENUM ('ORDER', 'RESERVATION');
CREATE TYPE "TaxCalculationMethod" AS ENUM ('AGGREGATE_V1', 'LINE_ROUNDED_V2');
CREATE TYPE "FiscalRoundingMode" AS ENUM ('DATABASE_DEFAULT', 'ROUND_HALF_UP');
CREATE TYPE "FiscalCalculationStatus" AS ENUM ('CURRENT', 'STALE', 'LOCKED');
CREATE TYPE "SaleAccountingEntryType" AS ENUM ('ORIGINAL', 'REVERSAL');
CREATE TYPE "SimpleTaxAdjustmentStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED');

ALTER TABLE "BusinessTaxProfile"
  ADD COLUMN "isImpoconsumoResponsible" BOOLEAN;

ALTER TABLE "Reservation"
  ADD COLUMN "itemNameSnapshot" TEXT,
  ADD COLUMN "unitPriceSnapshot" DECIMAL(10,2),
  ADD COLUMN "durationMinutesSnapshot" INTEGER;

-- Fiscal children without their historical parent are corrupt, not legacy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SaleTaxLine" l
    LEFT JOIN "OrderFiscalContext" c ON c."orderId" = l."orderId"
    WHERE c."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "TaxCalculationSnapshot" s
    LEFT JOIN "OrderFiscalContext" c ON c."orderId" = s."orderId"
    WHERE c."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'ORPHANED_DATA';
  END IF;
END $$;

ALTER TABLE "OrderFiscalContext" RENAME TO "SaleFiscalContext";
ALTER INDEX "OrderFiscalContext_orderId_key"
  RENAME TO "SaleFiscalContext_orderId_key";
ALTER TABLE "SaleFiscalContext"
  RENAME CONSTRAINT "OrderFiscalContext_pkey" TO "SaleFiscalContext_pkey";
ALTER TABLE "SaleFiscalContext"
  RENAME CONSTRAINT "OrderFiscalContext_orderId_fkey"
  TO "SaleFiscalContext_orderId_fkey";

ALTER TABLE "SaleFiscalContext"
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "sourceType" "FiscalSourceType",
  ALTER COLUMN "orderId" DROP NOT NULL,
  ADD COLUMN "reservationId" TEXT,
  ADD COLUMN "calculationMethod" "TaxCalculationMethod" NOT NULL DEFAULT 'AGGREGATE_V1',
  ADD COLUMN "taxEngineVersion" TEXT NOT NULL DEFAULT 'aggregate-v1',
  ADD COLUMN "roundingMode" "FiscalRoundingMode" NOT NULL DEFAULT 'DATABASE_DEFAULT',
  ADD COLUMN "roundingScale" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "calculationStatus" "FiscalCalculationStatus" NOT NULL DEFAULT 'STALE',
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "calculatedAt" TIMESTAMP(3),
  ADD COLUMN "invalidatedAt" TIMESTAMP(3),
  ADD COLUMN "invalidationReason" TEXT,
  ADD COLUMN "calculationLockedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "SaleFiscalContext" c
SET "businessId" = o."businessId",
    "sourceType" = 'ORDER',
    "calculationMethod" = 'AGGREGATE_V1',
    "taxEngineVersion" = 'aggregate-v1',
    "roundingMode" = 'DATABASE_DEFAULT',
    "roundingScale" = 2,
    "calculationStatus" = CASE
      WHEN o."status" = 'COMPLETED' THEN 'LOCKED'::"FiscalCalculationStatus"
      ELSE 'STALE'::"FiscalCalculationStatus"
    END,
    "invalidatedAt" = CASE
      WHEN o."status" = 'COMPLETED' THEN NULL ELSE CURRENT_TIMESTAMP
    END,
    "invalidationReason" = CASE
      WHEN o."status" = 'COMPLETED' THEN NULL
      ELSE 'LEGACY_FINGERPRINT_MISSING'
    END
FROM "Order" o
WHERE o."id" = c."orderId";
ALTER TABLE "SaleFiscalContext"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "SaleFiscalContext"
  ALTER COLUMN "businessId" SET NOT NULL,
  ALTER COLUMN "sourceType" SET NOT NULL;

ALTER TABLE "SaleFiscalContext"
  ADD CONSTRAINT "SaleFiscalContext_source_xor_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "reservationId" IS NULL)
    OR
    ("sourceType" = 'RESERVATION' AND "reservationId" IS NOT NULL AND "orderId" IS NULL)
  ),
  ADD CONSTRAINT "SaleFiscalContext_roundingScale_check" CHECK ("roundingScale" >= 0),
  ADD CONSTRAINT "SaleFiscalContext_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleFiscalContext_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "SaleFiscalContext_reservationId_key"
  ON "SaleFiscalContext"("reservationId") WHERE "reservationId" IS NOT NULL;
CREATE INDEX "SaleFiscalContext_businessId_calculationStatus_idx"
  ON "SaleFiscalContext"("businessId", "calculationStatus");
CREATE INDEX "SaleFiscalContext_sourceType_idx"
  ON "SaleFiscalContext"("sourceType");

-- Resolve only trustworthy historical accounting groups.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AccountingMovement" m
    JOIN "Order" o ON o."id" = m."originId" AND o."businessId" = m."businessId"
    JOIN "Reservation" r ON r."id" = m."originId" AND r."businessId" = m."businessId"
    WHERE m."originType" = 'ORDER'
      AND NOT (
        o."origin" = 'MANUAL'
        AND r."origin" = 'MANUAL'
        AND (SELECT COUNT(*) FROM "OrderItem" oi WHERE oi."orderId" = o."id") = 1
        AND EXISTS (
          SELECT 1 FROM "OrderItem" oi
          WHERE oi."orderId" = o."id"
            AND oi."itemTypeSnapshot" = 'SERVICE'
            AND oi."itemId" = r."itemId"
        )
      )
  ) THEN
    RAISE EXCEPTION 'LEGACY_ACCOUNTING_GROUP_AMBIGUOUS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AccountingMovement"
    WHERE "originType" = 'ORDER' AND "originId" IS NOT NULL
    GROUP BY "businessId", "originId"
    HAVING COUNT(DISTINCT "date") > 1
  ) THEN
    RAISE EXCEPTION 'LEGACY_ACCOUNTING_GROUP_AMBIGUOUS';
  END IF;
END $$;

CREATE TABLE "SaleAccountingEntry" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceType" "FiscalSourceType" NOT NULL,
  "orderId" TEXT,
  "reservationId" TEXT,
  "fiscalContextId" TEXT,
  "entryType" "SaleAccountingEntryType" NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL,
  "debitTotal" DECIMAL(18,2) NOT NULL,
  "creditTotal" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleAccountingEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleAccountingEntry_source_xor_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "reservationId" IS NULL)
    OR
    ("sourceType" = 'RESERVATION' AND "reservationId" IS NOT NULL AND "orderId" IS NULL)
  )
);

INSERT INTO "SaleAccountingEntry" (
  "id", "businessId", "sourceType", "orderId", "reservationId",
  "fiscalContextId", "entryType", "postedAt", "debitTotal", "creditTotal"
)
SELECT
  'legacy-' || md5(m."businessId" || ':' || m."originId"),
  m."businessId",
  CASE WHEN o."id" IS NOT NULL THEN 'ORDER'::"FiscalSourceType"
       ELSE 'RESERVATION'::"FiscalSourceType" END,
  CASE WHEN o."id" IS NOT NULL THEN m."originId" ELSE NULL END,
  CASE WHEN o."id" IS NULL THEN m."originId" ELSE NULL END,
  c."id",
  'ORIGINAL',
  MIN(m."date"),
  COALESCE(SUM(m."amount") FILTER (WHERE m."nature" = 'DEBIT'), 0),
  COALESCE(SUM(m."amount") FILTER (WHERE m."nature" = 'CREDIT'), 0)
FROM "AccountingMovement" m
LEFT JOIN "Order" o
  ON o."id" = m."originId" AND o."businessId" = m."businessId"
LEFT JOIN "Reservation" r
  ON r."id" = m."originId" AND r."businessId" = m."businessId"
LEFT JOIN "SaleFiscalContext" c
  ON c."orderId" = o."id" OR c."reservationId" = r."id"
WHERE m."originType" = 'ORDER'
  AND m."originId" IS NOT NULL
  AND (o."id" IS NOT NULL OR r."id" IS NOT NULL)
GROUP BY m."businessId", m."originId", o."id", r."id", c."id";

ALTER TABLE "AccountingMovement"
  ADD COLUMN "saleAccountingEntryId" TEXT,
  ADD COLUMN "reversalOfMovementId" TEXT;
UPDATE "AccountingMovement" m
SET "saleAccountingEntryId" =
  'legacy-' || md5(m."businessId" || ':' || m."originId")
WHERE m."originType" = 'ORDER' AND m."originId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "SaleAccountingEntry" e
    WHERE e."id" = 'legacy-' || md5(m."businessId" || ':' || m."originId")
  );

UPDATE "SaleFiscalContext" c
SET "calculationLockedAt" = COALESCE(
  (SELECT e."postedAt" FROM "SaleAccountingEntry" e
   WHERE e."fiscalContextId" = c."id" AND e."entryType" = 'ORIGINAL'),
  (SELECT o."accountingPostedAt" FROM "Order" o WHERE o."id" = c."orderId")
)
WHERE c."calculationStatus" = 'LOCKED';

DO $$
DECLARE unresolved_ids TEXT;
BEGIN
  SELECT string_agg(c."orderId", ',')
  INTO unresolved_ids
  FROM "SaleFiscalContext" c
  JOIN "Order" o ON o."id" = c."orderId"
  WHERE o."status" = 'COMPLETED'
    AND c."calculationStatus" = 'LOCKED'
    AND c."calculationLockedAt" IS NULL;
  IF unresolved_ids IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_LOCK_DATE_UNRESOLVED: %', unresolved_ids;
  END IF;
END $$;

ALTER TABLE "SaleTaxLine"
  DROP CONSTRAINT "SaleTaxLine_orderId_fkey",
  ADD COLUMN "fiscalContextId" TEXT,
  ADD COLUMN "taxTreatment" "ItemTaxTreatment",
  ALTER COLUMN "baseAmount" TYPE DECIMAL(18,2),
  ALTER COLUMN "rate" TYPE DECIMAL(8,6),
  ALTER COLUMN "taxAmount" TYPE DECIMAL(18,2),
  ADD COLUMN "saleConcept" "SaleConcept",
  ADD COLUMN "calculationMethod" "TaxCalculationMethod" NOT NULL DEFAULT 'AGGREGATE_V1',
  ADD COLUMN "roundingMode" "FiscalRoundingMode" NOT NULL DEFAULT 'DATABASE_DEFAULT',
  ADD COLUMN "roundingScale" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "isReversal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "saleReversalId" TEXT,
  ADD COLUMN "reversalOfTaxLineId" TEXT;
UPDATE "SaleTaxLine" l SET "fiscalContextId" = c."id"
FROM "SaleFiscalContext" c WHERE c."orderId" = l."orderId";
ALTER TABLE "SaleTaxLine"
  ALTER COLUMN "fiscalContextId" SET NOT NULL,
  DROP COLUMN "orderId";

ALTER TABLE "TaxCalculationSnapshot"
  DROP CONSTRAINT "TaxCalculationSnapshot_orderId_fkey",
  ADD COLUMN "fiscalContextId" TEXT,
  ADD COLUMN "calculationMethod" "TaxCalculationMethod" NOT NULL DEFAULT 'AGGREGATE_V1',
  ADD COLUMN "taxEngineVersion" TEXT NOT NULL DEFAULT 'aggregate-v1',
  ADD COLUMN "roundingMode" "FiscalRoundingMode" NOT NULL DEFAULT 'DATABASE_DEFAULT',
  ADD COLUMN "roundingScale" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "calculatedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "TaxCalculationSnapshot" s SET "fiscalContextId" = c."id"
FROM "SaleFiscalContext" c WHERE c."orderId" = s."orderId";
ALTER TABLE "TaxCalculationSnapshot"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
DROP INDEX "TaxCalculationSnapshot_orderId_key";
ALTER TABLE "TaxCalculationSnapshot"
  ALTER COLUMN "fiscalContextId" SET NOT NULL,
  DROP COLUMN "orderId";

CREATE TABLE "SaleReversal" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceType" "FiscalSourceType" NOT NULL,
  "orderId" TEXT,
  "reservationId" TEXT,
  "fiscalContextId" TEXT,
  "reason" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "reversedAt" TIMESTAMP(3) NOT NULL,
  "inventoryReversedAt" TIMESTAMP(3),
  "accountingReversedAt" TIMESTAMP(3),
  "reversalAccountingEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleReversal_source_xor_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "reservationId" IS NULL)
    OR
    ("sourceType" = 'RESERVATION' AND "reservationId" IS NOT NULL AND "orderId" IS NULL)
  )
);

ALTER TABLE "InventoryMovement" ADD COLUMN "saleReversalId" TEXT;

CREATE TABLE "SimpleTaxIncomeAdjustment" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "saleReversalId" TEXT NOT NULL,
  "sourceFiscalContextId" TEXT,
  "originalTaxYear" INTEGER NOT NULL,
  "originalPeriodNumber" INTEGER NOT NULL,
  "targetTaxYear" INTEGER NOT NULL,
  "targetPeriodNumber" INTEGER NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "SimpleTaxAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "appliedPeriodId" TEXT,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimpleTaxIncomeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimpleTaxAdjustmentTargetHistory" (
  "id" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "fromTaxYear" INTEGER NOT NULL,
  "fromPeriodNumber" INTEGER NOT NULL,
  "toTaxYear" INTEGER NOT NULL,
  "toPeriodNumber" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimpleTaxAdjustmentTargetHistory_pkey" PRIMARY KEY ("id")
);

-- Keys, partial uniqueness and relations.
CREATE UNIQUE INDEX "SaleReversal_orderId_once"
  ON "SaleReversal"("orderId") WHERE "orderId" IS NOT NULL;
CREATE UNIQUE INDEX "SaleReversal_reservationId_once"
  ON "SaleReversal"("reservationId") WHERE "reservationId" IS NOT NULL;
CREATE UNIQUE INDEX "SaleReversal_fiscalContextId_once"
  ON "SaleReversal"("fiscalContextId") WHERE "fiscalContextId" IS NOT NULL;
CREATE UNIQUE INDEX "SaleReversal_reversalAccountingEntryId_key"
  ON "SaleReversal"("reversalAccountingEntryId");
CREATE UNIQUE INDEX "SaleTaxLine_reversalOfTaxLineId_key"
  ON "SaleTaxLine"("reversalOfTaxLineId");
CREATE UNIQUE INDEX "AccountingMovement_reversalOfMovementId_key"
  ON "AccountingMovement"("reversalOfMovementId");
CREATE UNIQUE INDEX "TaxCalculationSnapshot_fiscalContextId_key"
  ON "TaxCalculationSnapshot"("fiscalContextId");
CREATE UNIQUE INDEX "SaleAccountingEntry_order_entry_key"
  ON "SaleAccountingEntry"("orderId", "entryType");
CREATE UNIQUE INDEX "SaleAccountingEntry_reservation_entry_key"
  ON "SaleAccountingEntry"("reservationId", "entryType");
CREATE UNIQUE INDEX "SimpleTaxIncomeAdjustment_saleReversalId_key"
  ON "SimpleTaxIncomeAdjustment"("saleReversalId");
CREATE INDEX "SaleTaxLine_fiscalContextId_taxType_isReversal_idx"
  ON "SaleTaxLine"("fiscalContextId", "taxType", "isReversal");
CREATE INDEX "SaleTaxLine_saleReversalId_idx"
  ON "SaleTaxLine"("saleReversalId");
CREATE INDEX "SaleAccountingEntry_businessId_postedAt_idx"
  ON "SaleAccountingEntry"("businessId", "postedAt");
CREATE INDEX "SaleAccountingEntry_fiscalContextId_idx"
  ON "SaleAccountingEntry"("fiscalContextId");
CREATE INDEX "SaleReversal_businessId_reversedAt_idx"
  ON "SaleReversal"("businessId", "reversedAt");
CREATE INDEX "AccountingMovement_saleAccountingEntryId_idx"
  ON "AccountingMovement"("saleAccountingEntryId");
CREATE INDEX "InventoryMovement_saleReversalId_idx"
  ON "InventoryMovement"("saleReversalId");
CREATE INDEX "SimpleTaxIncomeAdjustment_target_idx"
  ON "SimpleTaxIncomeAdjustment"("businessId", "targetTaxYear", "targetPeriodNumber", "status");
CREATE INDEX "SimpleTaxIncomeAdjustment_appliedPeriodId_idx"
  ON "SimpleTaxIncomeAdjustment"("appliedPeriodId");
CREATE INDEX "SimpleTaxAdjustmentTargetHistory_adjustmentId_changedAt_idx"
  ON "SimpleTaxAdjustmentTargetHistory"("adjustmentId", "changedAt");

ALTER TABLE "SaleAccountingEntry"
  ADD CONSTRAINT "SaleAccountingEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleAccountingEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleAccountingEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleAccountingEntry_fiscalContextId_fkey" FOREIGN KEY ("fiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE SET NULL;
ALTER TABLE "AccountingMovement"
  ADD CONSTRAINT "AccountingMovement_saleAccountingEntryId_fkey" FOREIGN KEY ("saleAccountingEntryId") REFERENCES "SaleAccountingEntry"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "AccountingMovement_reversalOfMovementId_fkey" FOREIGN KEY ("reversalOfMovementId") REFERENCES "AccountingMovement"("id") ON DELETE RESTRICT;
ALTER TABLE "SaleTaxLine"
  ADD CONSTRAINT "SaleTaxLine_fiscalContextId_fkey" FOREIGN KEY ("fiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleTaxLine_reversalOfTaxLineId_fkey" FOREIGN KEY ("reversalOfTaxLineId") REFERENCES "SaleTaxLine"("id") ON DELETE RESTRICT;
ALTER TABLE "TaxCalculationSnapshot"
  ADD CONSTRAINT "TaxCalculationSnapshot_fiscalContextId_fkey" FOREIGN KEY ("fiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE CASCADE;
ALTER TABLE "SaleReversal"
  ADD CONSTRAINT "SaleReversal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleReversal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SaleReversal_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SaleReversal_fiscalContextId_fkey" FOREIGN KEY ("fiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SaleReversal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "SaleReversal_reversalAccountingEntryId_fkey" FOREIGN KEY ("reversalAccountingEntryId") REFERENCES "SaleAccountingEntry"("id") ON DELETE SET NULL;
ALTER TABLE "SaleTaxLine"
  ADD CONSTRAINT "SaleTaxLine_saleReversalId_fkey" FOREIGN KEY ("saleReversalId") REFERENCES "SaleReversal"("id") ON DELETE RESTRICT;
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_saleReversalId_fkey" FOREIGN KEY ("saleReversalId") REFERENCES "SaleReversal"("id") ON DELETE SET NULL;
ALTER TABLE "SimpleTaxIncomeAdjustment"
  ADD CONSTRAINT "SimpleTaxIncomeAdjustment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SimpleTaxIncomeAdjustment_saleReversalId_fkey" FOREIGN KEY ("saleReversalId") REFERENCES "SaleReversal"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SimpleTaxIncomeAdjustment_sourceFiscalContextId_fkey" FOREIGN KEY ("sourceFiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "SimpleTaxIncomeAdjustment_appliedPeriodId_fkey" FOREIGN KEY ("appliedPeriodId") REFERENCES "SimpleTaxPeriod"("id") ON DELETE SET NULL;
ALTER TABLE "SimpleTaxAdjustmentTargetHistory"
  ADD CONSTRAINT "SimpleTaxAdjustmentTargetHistory_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "SimpleTaxIncomeAdjustment"("id") ON DELETE CASCADE;

-- Locked fiscal data is immutable. Reversal inserts are narrowly validated.
CREATE FUNCTION protect_locked_sale_fiscal_context() RETURNS trigger AS $$
BEGIN
  IF OLD."calculationStatus" = 'LOCKED' THEN
    RAISE EXCEPTION 'FISCAL_CONTEXT_LOCKED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SaleFiscalContext_locked_update"
  BEFORE UPDATE OR DELETE ON "SaleFiscalContext"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_sale_fiscal_context();

CREATE FUNCTION protect_locked_fiscal_child() RETURNS trigger AS $$
DECLARE context_status "FiscalCalculationStatus";
DECLARE original_line "SaleTaxLine"%ROWTYPE;
BEGIN
  SELECT "calculationStatus" INTO context_status
  FROM "SaleFiscalContext"
  WHERE "id" = COALESCE(NEW."fiscalContextId", OLD."fiscalContextId");
  IF context_status <> 'LOCKED' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'SaleTaxLine' THEN
    IF TG_OP <> 'INSERT' OR NOT NEW."isReversal" THEN
      RAISE EXCEPTION 'FISCAL_CONTEXT_LOCKED';
    END IF;
    IF NEW."saleReversalId" IS NULL OR NEW."reversalOfTaxLineId" IS NULL THEN
      RAISE EXCEPTION 'INVALID_FISCAL_REVERSAL_LINE';
    END IF;
    SELECT * INTO original_line FROM "SaleTaxLine"
    WHERE "id" = NEW."reversalOfTaxLineId";
    IF original_line."id" IS NULL
      OR original_line."fiscalContextId" <> NEW."fiscalContextId"
      OR original_line."isReversal"
      OR original_line."taxType" <> NEW."taxType"
      OR original_line."direction" <> NEW."direction"
      OR original_line."taxTreatment" IS DISTINCT FROM NEW."taxTreatment"
      OR original_line."rate" <> NEW."rate"
      OR original_line."saleConcept" IS DISTINCT FROM NEW."saleConcept"
      OR original_line."calculationMethod" <> NEW."calculationMethod"
      OR original_line."roundingMode" <> NEW."roundingMode"
      OR original_line."roundingScale" <> NEW."roundingScale"
      OR original_line."accountCode" <> NEW."accountCode"
      OR original_line."baseAmount" <> -NEW."baseAmount"
      OR original_line."taxAmount" <> -NEW."taxAmount"
      OR NOT EXISTS (
        SELECT 1 FROM "SaleReversal" r
        WHERE r."id" = NEW."saleReversalId"
          AND r."fiscalContextId" = NEW."fiscalContextId"
      )
    THEN RAISE EXCEPTION 'INVALID_FISCAL_REVERSAL_LINE';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'FISCAL_CONTEXT_LOCKED';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SaleTaxLine_locked_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "SaleTaxLine"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_fiscal_child();
CREATE TRIGGER "TaxCalculationSnapshot_locked_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "TaxCalculationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_fiscal_child();

-- No historical monetary amount is recalculated by this migration.
-- Confirmed sales without a context remain LEGACY_CONFIRMED_WITHOUT_FISCAL_CONTEXT
-- at the application contract boundary.
