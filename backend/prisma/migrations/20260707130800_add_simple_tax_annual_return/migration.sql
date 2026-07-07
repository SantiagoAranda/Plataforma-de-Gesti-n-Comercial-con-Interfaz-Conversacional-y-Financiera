-- CreateEnum
CREATE TYPE "SimpleTaxAnnualReturnStatus" AS ENUM ('CALCULATED', 'POSTED', 'PAID');

-- AlterEnum
ALTER TYPE "AccountingMovementOriginType" ADD VALUE 'SIMPLE_TAX_ANNUAL_RETURN';

-- CreateTable
CREATE TABLE "SimpleTaxAnnualReturn" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "status" "SimpleTaxAnnualReturnStatus" NOT NULL DEFAULT 'CALCULATED',
    "filingMode" "SimpleTaxFilingMode" NOT NULL,
    "groupCode" TEXT,
    "groupName" TEXT,
    "grossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manualGrossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "excludedIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableGrossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableGrossIncomeUvt" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "grossSimpleTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "electronicPaymentsIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "electronicPaymentsDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pensionContributionsDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDiscounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bimonthlyAdvancesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAnnualTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceInFavor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calculationSnapshot" JSONB,
    "postedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(14,2),
    "paymentAccountCode" TEXT,
    "accountingEntryId" TEXT,
    "paidAccountingEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleTaxAnnualReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimpleTaxAnnualReturn_businessId_taxYear_key" ON "SimpleTaxAnnualReturn"("businessId", "taxYear");

-- CreateIndex
CREATE INDEX "SimpleTaxAnnualReturn_businessId_status_idx" ON "SimpleTaxAnnualReturn"("businessId", "status");

-- AddForeignKey
ALTER TABLE "SimpleTaxAnnualReturn" ADD CONSTRAINT "SimpleTaxAnnualReturn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
