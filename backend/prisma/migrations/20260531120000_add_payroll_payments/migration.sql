ALTER TYPE "AccountingMovementOriginType" ADD VALUE IF NOT EXISTS 'PAYROLL_PAYMENT';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

CREATE TYPE "PayrollPaymentType" AS ENUM ('SALARY_PAYMENT', 'ADVANCE', 'ADJUSTMENT');
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
CREATE TYPE "PayrollBenefitPaymentType" AS ENUM ('PRIMA', 'CESANTIAS', 'INTERESES_CESANTIAS', 'VACACIONES');

CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "installmentNumber" INTEGER,
    "paymentCycle" "PayrollPaymentCycle" NOT NULL,
    "type" "PayrollPaymentType" NOT NULL DEFAULT 'SALARY_PAYMENT',
    "status" "PayrollPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(20,6) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollBenefitPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "PayrollBenefitPaymentType" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "status" "PayrollPaymentStatus" NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3),
    "periodId" TEXT,
    "payrollRunId" TEXT,
    "settlementId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollBenefitPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollPayment_payrollRunId_installmentNumber_type_key" ON "PayrollPayment"("payrollRunId", "installmentNumber", "type");
CREATE INDEX "PayrollPayment_businessId_status_idx" ON "PayrollPayment"("businessId", "status");
CREATE INDEX "PayrollPayment_businessId_employeeId_idx" ON "PayrollPayment"("businessId", "employeeId");
CREATE INDEX "PayrollPayment_contractId_status_idx" ON "PayrollPayment"("contractId", "status");

CREATE INDEX "PayrollBenefitPayment_businessId_contractId_idx" ON "PayrollBenefitPayment"("businessId", "contractId");
CREATE INDEX "PayrollBenefitPayment_businessId_employeeId_idx" ON "PayrollBenefitPayment"("businessId", "employeeId");
CREATE INDEX "PayrollBenefitPayment_contractId_type_idx" ON "PayrollBenefitPayment"("contractId", "type");

ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmployeeContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmployeeContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollBenefitPayment" ADD CONSTRAINT "PayrollBenefitPayment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PayrollContractSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
