-- Create enum for accounting movement origin
CREATE TYPE "AccountingMovementOriginType" AS ENUM ('MANUAL', 'ORDER');

-- Create table for simple accounting movements
CREATE TABLE "AccountingMovement" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "businessId" TEXT NOT NULL,
    "pucSubcuentaId" VARCHAR(6) NOT NULL,
    "pucCode" VARCHAR(6) NOT NULL,
    "pucName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "detail" TEXT NOT NULL,
    "originType" "AccountingMovementOriginType" NOT NULL,
    "originId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

-- Indexes for common filters
CREATE INDEX "AccountingMovement_businessId_date_idx" ON "AccountingMovement"("businessId", "date");
CREATE INDEX "AccountingMovement_pucSubcuentaId_idx" ON "AccountingMovement"("pucSubcuentaId");
CREATE INDEX "AccountingMovement_originType_idx" ON "AccountingMovement"("originType");

-- FKs
ALTER TABLE "AccountingMovement"
  ADD CONSTRAINT "AccountingMovement_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingMovement"
  ADD CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey"
  FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
