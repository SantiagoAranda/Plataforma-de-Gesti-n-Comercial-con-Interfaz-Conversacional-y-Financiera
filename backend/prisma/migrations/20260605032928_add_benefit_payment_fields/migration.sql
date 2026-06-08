-- AlterEnum
ALTER TYPE "AccountingMovementOriginType" ADD VALUE 'PAYROLL_BENEFIT_PAYMENT';

-- AlterTable
ALTER TABLE "PayrollBenefitPayment" ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "semester" INTEGER,
ADD COLUMN     "year" INTEGER;
