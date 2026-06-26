-- CreateEnum
CREATE TYPE "ReceiptSource" AS ENUM ('OCR', 'MANUAL', 'EDITED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PROCESSING', 'READY_FOR_REVIEW', 'DRAFT', 'POSTED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseAccountingType" AS ENUM ('EXPENSE', 'COST');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SERVICES', 'RENT', 'MARKETING', 'PROFESSIONAL_FEES', 'FOOD', 'TRANSPORT', 'MAINTENANCE', 'OTHER');

-- AlterEnum
ALTER TYPE "AccountingMovementOriginType" ADD VALUE IF NOT EXISTS 'EXPENSE_RECEIPT';

-- CreateTable
CREATE TABLE "ExpenseReceipt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PROCESSING',
    "source" "ReceiptSource" NOT NULL DEFAULT 'OCR',
    "bankName" TEXT,
    "reference" TEXT,
    "destinationName" TEXT,
    "destinationBank" TEXT,
    "destinationAccount" TEXT,
    "amount" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "description" TEXT,
    "rawText" TEXT,
    "parsedPayload" JSONB,
    "confidence" DECIMAL(5,4),
    "processedImageHash" TEXT,
    "temporaryObjectKey" TEXT,
    "temporaryExpiresAt" TIMESTAMP(3),
    "processingError" TEXT,
    "duplicateWarning" TEXT,
    "accountingType" "ExpenseAccountingType",
    "category" "ExpenseCategory",
    "pucCuentaCode" VARCHAR(4),
    "pucSubcuentaId" VARCHAR(6),
    "accountingMovementIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseReceipt_businessId_status_createdAt_idx" ON "ExpenseReceipt"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_businessId_paidAt_idx" ON "ExpenseReceipt"("businessId", "paidAt");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_businessId_reference_idx" ON "ExpenseReceipt"("businessId", "reference");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_businessId_reference_amount_paidAt_idx" ON "ExpenseReceipt"("businessId", "reference", "amount", "paidAt");

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_pucCuentaCode_fkey" FOREIGN KEY ("pucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_pucSubcuentaId_fkey" FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE SET NULL ON UPDATE CASCADE;
