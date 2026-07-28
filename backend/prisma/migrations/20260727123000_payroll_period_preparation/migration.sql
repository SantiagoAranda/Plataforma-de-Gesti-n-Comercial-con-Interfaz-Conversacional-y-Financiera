-- Idempotency records for preparation are deliberately distinct from payment batches.
CREATE TABLE "PayrollPeriodPreparation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollPeriodPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollPeriodPreparation_businessId_idempotencyKey_key"
ON "PayrollPeriodPreparation"("businessId", "idempotencyKey");
CREATE INDEX "PayrollPeriodPreparation_businessId_payrollPeriodId_idx"
ON "PayrollPeriodPreparation"("businessId", "payrollPeriodId");

ALTER TABLE "PayrollPeriodPreparation"
ADD CONSTRAINT "PayrollPeriodPreparation_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriodPreparation"
ADD CONSTRAINT "PayrollPeriodPreparation_payrollPeriodId_fkey"
FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
