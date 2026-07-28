-- Etapa 2: novedades fechadas. No modifica runs, snapshots, ajustes ni pagos existentes.
CREATE TYPE "PayrollEventType" AS ENUM ('OVERTIME', 'NIGHT_SURCHARGE', 'SUNDAY_HOLIDAY_SURCHARGE', 'SICK_LEAVE', 'PAID_LEAVE', 'UNPAID_LEAVE', 'VACATION', 'ABSENCE', 'COMMISSION', 'BONUS', 'OTHER_ACCRUAL', 'OTHER_DEDUCTION');
CREATE TYPE "PayrollEventStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'CANCELLED');
CREATE TYPE "PayrollEventUnit" AS ENUM ('HOURS', 'DAYS', 'MONEY');

CREATE TABLE "PayrollEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollPeriodId" TEXT,
  "payrollRunId" TEXT,
  "type" "PayrollEventType" NOT NULL,
  "status" "PayrollEventStatus" NOT NULL DEFAULT 'DRAFT',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "quantity" DECIMAL(20,6),
  "unit" "PayrollEventUnit",
  "overtimeCode" TEXT,
  "amountOverride" DECIMAL(20,6),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollEvent_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "PayrollEvent_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);

CREATE INDEX "PayrollEvent_businessId_payrollPeriodId_employeeId_idx" ON "PayrollEvent"("businessId", "payrollPeriodId", "employeeId");
CREATE INDEX "PayrollEvent_payrollPeriodId_status_startDate_idx" ON "PayrollEvent"("payrollPeriodId", "status", "startDate");
CREATE INDEX "PayrollEvent_employeeId_startDate_idx" ON "PayrollEvent"("employeeId", "startDate");
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
