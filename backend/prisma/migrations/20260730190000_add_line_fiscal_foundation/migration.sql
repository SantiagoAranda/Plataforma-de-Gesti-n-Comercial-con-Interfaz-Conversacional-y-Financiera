-- CreateEnum
CREATE TYPE "ItemTaxTreatment" AS ENUM ('TAXED', 'EXEMPT', 'EXCLUDED', 'NOT_TAXED');

-- AlterTable
ALTER TABLE "Item"
ADD COLUMN "taxTreatment" "ItemTaxTreatment" NOT NULL DEFAULT 'TAXED',
ADD COLUMN "vatRate" DECIMAL(6,4),
ADD COLUMN "fiscalCode" TEXT,
ADD COLUMN "unitMeasureCode" TEXT NOT NULL DEFAULT '94',
ADD COLUMN "standardCode" TEXT NOT NULL DEFAULT '999';

-- AlterTable
ALTER TABLE "OrderFiscalContext"
ADD COLUMN "buyerDv" TEXT,
ADD COLUMN "buyerAddress" TEXT,
ADD COLUMN "buyerPhone" TEXT,
ADD COLUMN "buyerCountryCode" TEXT,
ADD COLUMN "buyerMunicipalityCode" TEXT,
ADD COLUMN "buyerTributeCode" TEXT,
ADD COLUMN "buyerIsFinalConsumer" BOOLEAN NOT NULL DEFAULT false;

-- This migration deliberately does not recalculate sales, update OrderItem,
-- create snapshots, or modify accounting and inventory records.
