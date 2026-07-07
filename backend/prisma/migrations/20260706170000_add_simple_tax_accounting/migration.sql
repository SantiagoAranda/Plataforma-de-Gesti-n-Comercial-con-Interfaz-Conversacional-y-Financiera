-- AlterEnum
ALTER TYPE "AccountingMovementOriginType" ADD VALUE 'SIMPLE_TAX_PERIOD';

-- AlterEnum
ALTER TYPE "SimpleTaxPeriodStatus" ADD VALUE 'PAID';

-- AlterTable
ALTER TABLE "SimpleTaxPeriod"
ADD COLUMN "accountingEntryId" TEXT,
ADD COLUMN "paidAccountingEntryId" TEXT,
ADD COLUMN "postedAt" TIMESTAMP(3),
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidAmount" DECIMAL(14,2),
ADD COLUMN "paymentAccountCode" TEXT;
