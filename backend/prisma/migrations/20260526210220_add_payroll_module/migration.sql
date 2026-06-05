/*
  Warnings:

  - You are about to alter the column `pucSubcuentaId` on the `AccountingMovement` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(6)`.

*/
-- CreateEnum
CREATE TYPE "PayrollContractType" AS ENUM ('INDEFINITE', 'FIXED_TERM');

-- CreateEnum
CREATE TYPE "PayrollPaymentCycle" AS ENUM ('MONTHLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CALCULATED', 'POSTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollNoticeStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPLIED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PayrollConceptCategory" AS ENUM ('EARNING', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'PARAFISCAL', 'BENEFIT_PROVISION', 'TAX', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "PayrollAccountingSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('COMMISSION', 'NON_SALARY_BONUS', 'LOAN_DEDUCTION', 'NIGHT_SURCHARGE', 'OVERTIME_DAY', 'OVERTIME_NIGHT', 'SUNDAY_HOLIDAY_DAY', 'SUNDAY_HOLIDAY_EXTRA_DAY', 'SUNDAY_HOLIDAY_NIGHT', 'SUNDAY_HOLIDAY_EXTRA_NIGHT');

-- CreateEnum
CREATE TYPE "PayrollSettlementType" AS ENUM ('REAL_TERMINATION', 'SIMULATION_TO_DATE');

-- CreateEnum
CREATE TYPE "PayrollSettlementStatus" AS ENUM ('DRAFT', 'CALCULATED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollWithholdingStatus" AS ENUM ('DISABLED_FOR_FUTURE_UPDATE', 'ENABLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountingMovementOriginType" ADD VALUE 'PAYROLL_RUN';
ALTER TYPE "AccountingMovementOriginType" ADD VALUE 'PAYROLL_SETTLEMENT';

-- DropForeignKey
ALTER TABLE "AccountingMovement" DROP CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey";

-- AlterTable
ALTER TABLE "AccountingMovement" ALTER COLUMN "pucSubcuentaId" SET DATA TYPE VARCHAR(6);

-- CreateTable
CREATE TABLE "PayrollGlobalParameter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "smmlv" DECIMAL(20,6) NOT NULL,
    "transportAllowance" DECIMAL(20,6) NOT NULL,
    "uvt" DECIMAL(20,6),
    "weeklyHours" DECIMAL(10,2) NOT NULL DEFAULT 44,
    "monthlyHours" DECIMAL(10,2) NOT NULL,
    "healthEmployeeRate" DECIMAL(10,6) NOT NULL DEFAULT 0.04,
    "pensionEmployeeRate" DECIMAL(10,6) NOT NULL DEFAULT 0.04,
    "healthEmployerRate" DECIMAL(10,6) NOT NULL DEFAULT 0.085,
    "pensionEmployerRate" DECIMAL(10,6) NOT NULL DEFAULT 0.12,
    "compensationFundRate" DECIMAL(10,6) NOT NULL DEFAULT 0.04,
    "senaRate" DECIMAL(10,6) NOT NULL DEFAULT 0.02,
    "icbfRate" DECIMAL(10,6) NOT NULL DEFAULT 0.03,
    "severanceRate" DECIMAL(10,6) NOT NULL DEFAULT 0.0833,
    "severanceInterestRate" DECIMAL(10,6) NOT NULL DEFAULT 0.01,
    "serviceBonusRate" DECIMAL(10,6) NOT NULL DEFAULT 0.0833,
    "vacationRate" DECIMAL(10,6) NOT NULL DEFAULT 0.0417,
    "law1819ThresholdSmmlv" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "transportLimitSmmlv" DECIMAL(10,2) NOT NULL DEFAULT 2,
    "withholdingStatus" "PayrollWithholdingStatus" NOT NULL DEFAULT 'DISABLED_FOR_FUTURE_UPDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollGlobalParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBusinessParameter" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "globalParameterId" TEXT,
    "year" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weeklyHours" DECIMAL(10,2),
    "monthlyHours" DECIMAL(10,2),
    "applyLaw1819" BOOLEAN NOT NULL DEFAULT true,
    "applySolidarityFund" BOOLEAN NOT NULL DEFAULT true,
    "applyIncomeTax" BOOLEAN NOT NULL DEFAULT false,
    "customTransportAllowance" DECIMAL(20,6),
    "customSmmlv" DECIMAL(20,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBusinessParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLegalUpdateNotice" (
    "id" TEXT NOT NULL,
    "globalParameterId" TEXT,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "changedFields" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLegalUpdateNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLegalUpdateNoticeBusiness" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "PayrollNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollLegalUpdateNoticeBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomicActivityCiiu" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "section" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomicActivityCiiu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollArlRiskClass" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(10,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollArlRiskClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollArlEconomicActivity" (
    "id" TEXT NOT NULL,
    "ciiuId" TEXT NOT NULL,
    "arlRiskClassId" TEXT NOT NULL,

    CONSTRAINT "PayrollArlEconomicActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollOvertimeRate" (
    "id" TEXT NOT NULL,
    "globalParameterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(10,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PayrollOvertimeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSolidarityBracket" (
    "id" TEXT NOT NULL,
    "globalParameterId" TEXT NOT NULL,
    "fromSmmlv" DECIMAL(10,2) NOT NULL,
    "toSmmlv" DECIMAL(10,2),
    "rate" DECIMAL(10,6) NOT NULL,

    CONSTRAINT "PayrollSolidarityBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentType" TEXT,
    "documentNumber" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeContract" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractType" "PayrollContractType" NOT NULL,
    "salaryMonthly" DECIMAL(20,6) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "applyLaw1819" BOOLEAN NOT NULL DEFAULT true,
    "paymentCycle" "PayrollPaymentCycle" NOT NULL DEFAULT 'MONTHLY',
    "installmentsCount" INTEGER NOT NULL DEFAULT 1,
    "arlRiskClassId" TEXT,
    "ciiuId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "paymentCycle" "PayrollPaymentCycle" NOT NULL DEFAULT 'MONTHLY',
    "installmentNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "workedDays" INTEGER NOT NULL DEFAULT 30,
    "baseSalary" DECIMAL(20,6) NOT NULL,
    "salaryEarned" DECIMAL(20,6) NOT NULL,
    "transportAllowance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "connectivityAllowance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "commissions" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "nonSalaryBonus" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grossIncome" DECIMAL(20,6) NOT NULL,
    "ibcAmount" DECIMAL(20,6) NOT NULL,
    "employeeHealth" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "employeePension" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "solidarityFund" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "withholdingTax" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalEmployeeDeductions" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(20,6) NOT NULL,
    "employerHealth" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "employerPension" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "employerArl" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "compensationFund" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "sena" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "icbf" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "severance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "severanceInterest" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "serviceBonus" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "vacation" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalEmployerContributions" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalParafiscals" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalBenefits" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "realEmployerCost" DECIMAL(20,6) NOT NULL,
    "usedParameters" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "quantity" DECIMAL(20,6),
    "rate" DECIMAL(10,6),
    "amount" DECIMAL(20,6) NOT NULL,
    "description" TEXT,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConceptResult" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PayrollConceptCategory" NOT NULL,
    "quantity" DECIMAL(20,6),
    "rate" DECIMAL(10,6),
    "baseAmount" DECIMAL(20,6),
    "amount" DECIMAL(20,6) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "PayrollConceptResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollWithholdingTaxConfig" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollWithholdingStatus" NOT NULL DEFAULT 'DISABLED_FOR_FUTURE_UPDATE',
    "description" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollWithholdingTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollWithholdingTaxResult" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "baseAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "status" "PayrollWithholdingStatus" NOT NULL DEFAULT 'DISABLED_FOR_FUTURE_UPDATE',
    "metadata" JSONB,

    CONSTRAINT "PayrollWithholdingTaxResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollContractSettlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "PayrollSettlementType" NOT NULL,
    "status" "PayrollSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "semesterOneDays" INTEGER NOT NULL DEFAULT 0,
    "semesterTwoDays" INTEGER NOT NULL DEFAULT 0,
    "totalWorkedDays" INTEGER NOT NULL DEFAULT 0,
    "severance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "severanceInterest" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "serviceBonusSemesterOne" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "serviceBonusSemesterTwo" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "vacation" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "vacationDays" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "usedParameters" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollContractSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollContractSettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "baseAmount" DECIMAL(20,6),
    "rate" DECIMAL(10,6),
    "days" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "PayrollContractSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAccountingMapping" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conceptCode" TEXT NOT NULL,
    "conceptName" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "side" "PayrollAccountingSide" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAccountingMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollGlobalParameter_year_isActive_idx" ON "PayrollGlobalParameter"("year", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollGlobalParameter_year_version_key" ON "PayrollGlobalParameter"("year", "version");

-- CreateIndex
CREATE INDEX "PayrollBusinessParameter_businessId_isActive_idx" ON "PayrollBusinessParameter"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBusinessParameter_businessId_year_key" ON "PayrollBusinessParameter"("businessId", "year");

-- CreateIndex
CREATE INDEX "PayrollLegalUpdateNotice_year_idx" ON "PayrollLegalUpdateNotice"("year");

-- CreateIndex
CREATE INDEX "PayrollLegalUpdateNoticeBusiness_businessId_status_idx" ON "PayrollLegalUpdateNoticeBusiness"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLegalUpdateNoticeBusiness_noticeId_businessId_key" ON "PayrollLegalUpdateNoticeBusiness"("noticeId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomicActivityCiiu_code_key" ON "EconomicActivityCiiu"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollArlRiskClass_level_key" ON "PayrollArlRiskClass"("level");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollArlEconomicActivity_ciiuId_arlRiskClassId_key" ON "PayrollArlEconomicActivity"("ciiuId", "arlRiskClassId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollOvertimeRate_globalParameterId_code_key" ON "PayrollOvertimeRate"("globalParameterId", "code");

-- CreateIndex
CREATE INDEX "PayrollSolidarityBracket_globalParameterId_idx" ON "PayrollSolidarityBracket"("globalParameterId");

-- CreateIndex
CREATE INDEX "Employee_businessId_isActive_idx" ON "Employee"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_businessId_documentNumber_key" ON "Employee"("businessId", "documentNumber");

-- CreateIndex
CREATE INDEX "EmployeeContract_businessId_employeeId_idx" ON "EmployeeContract"("businessId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeContract_businessId_isActive_idx" ON "EmployeeContract"("businessId", "isActive");

-- CreateIndex
CREATE INDEX "PayrollPeriod_businessId_status_idx" ON "PayrollPeriod"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_businessId_year_month_paymentCycle_installmen_key" ON "PayrollPeriod"("businessId", "year", "month", "paymentCycle", "installmentNumber");

-- CreateIndex
CREATE INDEX "PayrollRun_businessId_calculatedAt_idx" ON "PayrollRun"("businessId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_payrollPeriodId_employeeId_key" ON "PayrollRun"("payrollPeriodId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollRunId_type_idx" ON "PayrollAdjustment"("payrollRunId", "type");

-- CreateIndex
CREATE INDEX "PayrollConceptResult_payrollRunId_category_idx" ON "PayrollConceptResult"("payrollRunId", "category");

-- CreateIndex
CREATE INDEX "PayrollConceptResult_code_idx" ON "PayrollConceptResult"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollWithholdingTaxConfig_year_key" ON "PayrollWithholdingTaxConfig"("year");

-- CreateIndex
CREATE INDEX "PayrollWithholdingTaxResult_payrollRunId_idx" ON "PayrollWithholdingTaxResult"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollContractSettlement_businessId_employeeId_idx" ON "PayrollContractSettlement"("businessId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollContractSettlement_businessId_status_idx" ON "PayrollContractSettlement"("businessId", "status");

-- CreateIndex
CREATE INDEX "PayrollContractSettlementLine_settlementId_idx" ON "PayrollContractSettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "PayrollAccountingMapping_businessId_isActive_idx" ON "PayrollAccountingMapping"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAccountingMapping_businessId_conceptCode_side_key" ON "PayrollAccountingMapping"("businessId", "conceptCode", "side");

-- AddForeignKey
ALTER TABLE "AccountingMovement" ADD CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey" FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBusinessParameter" ADD CONSTRAINT "PayrollBusinessParameter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBusinessParameter" ADD CONSTRAINT "PayrollBusinessParameter_globalParameterId_fkey" FOREIGN KEY ("globalParameterId") REFERENCES "PayrollGlobalParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLegalUpdateNotice" ADD CONSTRAINT "PayrollLegalUpdateNotice_globalParameterId_fkey" FOREIGN KEY ("globalParameterId") REFERENCES "PayrollGlobalParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLegalUpdateNoticeBusiness" ADD CONSTRAINT "PayrollLegalUpdateNoticeBusiness_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "PayrollLegalUpdateNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLegalUpdateNoticeBusiness" ADD CONSTRAINT "PayrollLegalUpdateNoticeBusiness_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollArlEconomicActivity" ADD CONSTRAINT "PayrollArlEconomicActivity_ciiuId_fkey" FOREIGN KEY ("ciiuId") REFERENCES "EconomicActivityCiiu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollArlEconomicActivity" ADD CONSTRAINT "PayrollArlEconomicActivity_arlRiskClassId_fkey" FOREIGN KEY ("arlRiskClassId") REFERENCES "PayrollArlRiskClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollOvertimeRate" ADD CONSTRAINT "PayrollOvertimeRate_globalParameterId_fkey" FOREIGN KEY ("globalParameterId") REFERENCES "PayrollGlobalParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSolidarityBracket" ADD CONSTRAINT "PayrollSolidarityBracket_globalParameterId_fkey" FOREIGN KEY ("globalParameterId") REFERENCES "PayrollGlobalParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_arlRiskClassId_fkey" FOREIGN KEY ("arlRiskClassId") REFERENCES "PayrollArlRiskClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContract" ADD CONSTRAINT "EmployeeContract_ciiuId_fkey" FOREIGN KEY ("ciiuId") REFERENCES "EconomicActivityCiiu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmployeeContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollConceptResult" ADD CONSTRAINT "PayrollConceptResult_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollWithholdingTaxResult" ADD CONSTRAINT "PayrollWithholdingTaxResult_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollContractSettlement" ADD CONSTRAINT "PayrollContractSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollContractSettlement" ADD CONSTRAINT "PayrollContractSettlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollContractSettlement" ADD CONSTRAINT "PayrollContractSettlement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmployeeContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollContractSettlementLine" ADD CONSTRAINT "PayrollContractSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PayrollContractSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAccountingMapping" ADD CONSTRAINT "PayrollAccountingMapping_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
