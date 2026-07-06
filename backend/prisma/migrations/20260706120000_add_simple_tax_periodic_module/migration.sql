-- CreateEnum
CREATE TYPE "SimpleTaxPeriodType" AS ENUM ('BIMONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SimpleTaxPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'POSTED');

-- CreateTable
CREATE TABLE "SimpleTaxRateBracket" (
    "id" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "periodType" "SimpleTaxPeriodType" NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "lowerUvt" DECIMAL(14,2) NOT NULL,
    "upperUvt" DECIMAL(14,2),
    "rate" DECIMAL(8,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleTaxRateBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSimpleTaxConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "taxYear" INTEGER NOT NULL,
    "groupCode" TEXT,
    "activityLabel" TEXT,
    "ciiuCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSimpleTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimpleTaxPeriod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SimpleTaxPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "salesGrossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manualGrossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "excludedIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableGrossIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableGrossIncomeUvt" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT,
    "appliedRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "grossSimpleTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "electronicPaymentsIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "electronicPaymentsDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pensionContributionsDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDiscounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netSimpleTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calculationSnapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleTaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimpleTaxRateBracket_taxYear_periodType_groupCode_lowerUvt_upperUvt_key" ON "SimpleTaxRateBracket"("taxYear", "periodType", "groupCode", "lowerUvt", "upperUvt");

-- CreateIndex
CREATE INDEX "SimpleTaxRateBracket_taxYear_periodType_groupCode_active_idx" ON "SimpleTaxRateBracket"("taxYear", "periodType", "groupCode", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSimpleTaxConfig_businessId_key" ON "BusinessSimpleTaxConfig"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "SimpleTaxPeriod_businessId_taxYear_periodNumber_key" ON "SimpleTaxPeriod"("businessId", "taxYear", "periodNumber");

-- CreateIndex
CREATE INDEX "SimpleTaxPeriod_businessId_taxYear_idx" ON "SimpleTaxPeriod"("businessId", "taxYear");

-- CreateIndex
CREATE INDEX "SimpleTaxPeriod_businessId_status_idx" ON "SimpleTaxPeriod"("businessId", "status");

-- AddForeignKey
ALTER TABLE "BusinessSimpleTaxConfig" ADD CONSTRAINT "BusinessSimpleTaxConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimpleTaxPeriod" ADD CONSTRAINT "SimpleTaxPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
