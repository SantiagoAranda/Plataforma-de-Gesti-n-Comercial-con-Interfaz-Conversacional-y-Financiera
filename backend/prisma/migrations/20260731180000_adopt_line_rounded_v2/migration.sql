-- Etapa 1B: LINE_ROUNDED_V2 for newly persisted fiscal contexts only.
-- This migration deliberately performs no historical monetary backfill.

CREATE TYPE "LineTaxType" AS ENUM (
  'VAT',
  'IMPOCONSUMO',
  'EXEMPT',
  'EXCLUDED',
  'NOT_TAXED',
  'NONE'
);

ALTER TYPE "TaxType" ADD VALUE 'EXEMPT';
ALTER TYPE "TaxType" ADD VALUE 'EXCLUDED';
ALTER TYPE "TaxType" ADD VALUE 'NOT_TAXED';
ALTER TYPE "TaxType" ADD VALUE 'NONE';

ALTER TABLE "SaleFiscalContext"
  ADD COLUMN "grossFiscalTotal" DECIMAL(14,2);

ALTER TABLE "TaxCalculationSnapshot"
  ADD COLUMN "lineSnapshotIds" JSONB;

CREATE TABLE "SaleItemFiscalSnapshot" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "fiscalContextId" TEXT NOT NULL,
  "sourceLineKey" TEXT NOT NULL,
  "orderItemId" TEXT,
  "reservationId" TEXT,
  "itemId" TEXT,
  "fiscalCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "unitPriceNet" DECIMAL(18,6) NOT NULL,
  "discountRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "unitMeasureCode" TEXT NOT NULL,
  "standardCode" TEXT NOT NULL,
  "taxTreatment" "ItemTaxTreatment" NOT NULL,
  "taxType" "LineTaxType" NOT NULL,
  "taxRate" DECIMAL(8,6) NOT NULL,
  "taxableBase" DECIMAL(18,2) NOT NULL,
  "taxAmount" DECIMAL(18,2) NOT NULL,
  "grossAmount" DECIMAL(18,2) NOT NULL,
  "saleConcept" "SaleConcept" NOT NULL,
  "calculationMethod" "TaxCalculationMethod" NOT NULL,
  "roundingMode" "FiscalRoundingMode" NOT NULL,
  "roundingScale" INTEGER NOT NULL,
  "taxEngineVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleItemFiscalSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleItemFiscalSnapshot_source_xor_check" CHECK (
    ("orderItemId" IS NOT NULL AND "reservationId" IS NULL
      AND "sourceLineKey" = "orderItemId")
    OR
    ("reservationId" IS NOT NULL AND "orderItemId" IS NULL
      AND "sourceLineKey" = 'reservation:' || "reservationId")
  ),
  CONSTRAINT "SaleItemFiscalSnapshot_zero_discount_check" CHECK (
    "discountRate" = 0 AND "discountAmount" = 0
  ),
  CONSTRAINT "SaleItemFiscalSnapshot_rounding_scale_check" CHECK (
    "roundingScale" = 2
  )
);

CREATE UNIQUE INDEX "SaleItemFiscalSnapshot_orderItemId_key"
  ON "SaleItemFiscalSnapshot"("orderItemId")
  WHERE "orderItemId" IS NOT NULL;
CREATE UNIQUE INDEX "SaleItemFiscalSnapshot_reservationId_key"
  ON "SaleItemFiscalSnapshot"("reservationId")
  WHERE "reservationId" IS NOT NULL;
CREATE UNIQUE INDEX "SaleItemFiscalSnapshot_context_line_key"
  ON "SaleItemFiscalSnapshot"("fiscalContextId", "sourceLineKey");
CREATE INDEX "SaleItemFiscalSnapshot_business_context_idx"
  ON "SaleItemFiscalSnapshot"("businessId", "fiscalContextId");

ALTER TABLE "SaleItemFiscalSnapshot"
  ADD CONSTRAINT "SaleItemFiscalSnapshot_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleItemFiscalSnapshot_fiscalContextId_fkey"
    FOREIGN KEY ("fiscalContextId") REFERENCES "SaleFiscalContext"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "SaleItemFiscalSnapshot_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SaleItemFiscalSnapshot_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

CREATE FUNCTION validate_sale_item_fiscal_snapshot_source() RETURNS trigger AS $$
DECLARE
  context_source "FiscalSourceType";
  context_order_id TEXT;
  context_reservation_id TEXT;
  order_item_order_id TEXT;
BEGIN
  SELECT "sourceType", "orderId", "reservationId"
  INTO context_source, context_order_id, context_reservation_id
  FROM "SaleFiscalContext"
  WHERE "id" = NEW."fiscalContextId";

  IF context_source = 'ORDER' THEN
    SELECT "orderId" INTO order_item_order_id
    FROM "OrderItem" WHERE "id" = NEW."orderItemId";
    IF NEW."reservationId" IS NOT NULL
      OR order_item_order_id IS DISTINCT FROM context_order_id THEN
      RAISE EXCEPTION 'FISCAL_SNAPSHOT_SOURCE_MISMATCH';
    END IF;
  ELSIF context_source = 'RESERVATION' THEN
    IF NEW."orderItemId" IS NOT NULL
      OR NEW."reservationId" IS DISTINCT FROM context_reservation_id
      OR NEW."quantity" <> 1 THEN
      RAISE EXCEPTION 'FISCAL_SNAPSHOT_SOURCE_MISMATCH';
    END IF;
  ELSE
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_SOURCE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SaleItemFiscalSnapshot_source_guard"
  BEFORE INSERT OR UPDATE ON "SaleItemFiscalSnapshot"
  FOR EACH ROW EXECUTE FUNCTION validate_sale_item_fiscal_snapshot_source();

CREATE TRIGGER "SaleItemFiscalSnapshot_locked_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "SaleItemFiscalSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_locked_fiscal_child();

-- Historical AGGREGATE_V1 contexts intentionally retain grossFiscalTotal = NULL
-- and have no SaleItemFiscalSnapshot rows.
