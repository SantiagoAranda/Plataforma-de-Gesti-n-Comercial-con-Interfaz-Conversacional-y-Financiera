-- Normalize only safe development SALARY_PAYMENT duplicates before enforcing
-- one payment of each type per run.  This check is global because the index is global.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PayrollRun" run
    JOIN "PayrollPeriod" period ON period.id = run."payrollPeriodId"
    JOIN "PayrollPayment" payment ON payment."payrollRunId" = run.id
    GROUP BY run.id, payment.type
    HAVING COUNT(*) > 1 AND NOT (
      payment.type = 'SALARY_PAYMENT'
      AND COUNT(*) = 2
      AND COUNT(*) FILTER (WHERE payment.status = 'PENDING' AND payment."paidAt" IS NULL) = 2
      AND COUNT(*) FILTER (WHERE payment."businessId" = run."businessId" AND payment."employeeId" = run."employeeId" AND payment."contractId" = run."contractId") = 2
      AND NOT EXISTS (
        SELECT 1 FROM "AccountingMovement" movement
        WHERE movement."originType" = 'PAYROLL_PAYMENT'
          AND movement."originId" IN (
            SELECT duplicate.id FROM "PayrollPayment" duplicate
            WHERE duplicate."payrollRunId" = run.id AND duplicate.type = payment.type
          )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unsafe duplicate payroll payments found; migration aborted before changes';
  END IF;
END $$;

WITH duplicate_runs AS (
  SELECT run.id AS run_id, run."netPay" AS net_pay, MIN(payment.id) AS keep_id
  FROM "PayrollRun" run
  JOIN "PayrollPayment" payment ON payment."payrollRunId" = run.id AND payment.type = 'SALARY_PAYMENT'
  GROUP BY run.id, run."netPay"
  HAVING COUNT(*) = 2
)
UPDATE "PayrollPayment" payment
SET amount = duplicate_runs.net_pay
FROM duplicate_runs
WHERE payment.id = duplicate_runs.keep_id;

WITH duplicate_runs AS (
  SELECT run.id AS run_id, MIN(payment.id) AS keep_id
  FROM "PayrollRun" run
  JOIN "PayrollPayment" payment ON payment."payrollRunId" = run.id AND payment.type = 'SALARY_PAYMENT'
  GROUP BY run.id
  HAVING COUNT(*) = 2
)
DELETE FROM "PayrollPayment" payment
USING duplicate_runs
WHERE payment."payrollRunId" = duplicate_runs.run_id
  AND payment.type = 'SALARY_PAYMENT'
  AND payment.id <> duplicate_runs.keep_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PayrollPayment"
    GROUP BY "payrollRunId", type
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate payroll payments remain; migration aborted before unique constraint';
  END IF;
END $$;

-- The steps below run only after the data invariant above holds.
DROP INDEX IF EXISTS "PayrollPayment_payrollRunId_installmentNumber_type_key";
CREATE UNIQUE INDEX "PayrollPayment_payrollRunId_type_key" ON "PayrollPayment"("payrollRunId", type);

CREATE TABLE "PayrollPaymentBatch" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "payrollPeriodId" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "totalPaid" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "paymentCount" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPaymentBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PayrollPayment" ADD COLUMN "batchId" TEXT;
CREATE UNIQUE INDEX "PayrollPaymentBatch_businessId_idempotencyKey_key" ON "PayrollPaymentBatch"("businessId", "idempotencyKey");
CREATE INDEX "PayrollPaymentBatch_businessId_payrollPeriodId_idx" ON "PayrollPaymentBatch"("businessId", "payrollPeriodId");
CREATE INDEX "PayrollPayment_batchId_idx" ON "PayrollPayment"("batchId");

ALTER TABLE "PayrollPaymentBatch" ADD CONSTRAINT "PayrollPaymentBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPaymentBatch" ADD CONSTRAINT "PayrollPaymentBatch_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayrollPaymentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
