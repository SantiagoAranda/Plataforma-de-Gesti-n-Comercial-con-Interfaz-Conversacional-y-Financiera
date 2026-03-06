/*
  Warnings:

  - A unique constraint covering the columns `[sourceOrderId]` on the table `AccountingEntry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[itemId,date,startMinute]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SalesAccountingTemplateType" AS ENUM ('PRODUCT', 'SERVICE');

-- DropIndex
DROP INDEX "Reservation_itemId_date_startMinute_endMinute_key";

-- AlterTable
ALTER TABLE "AccountingEntry" ADD COLUMN     "sourceOrderId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "currency" SET DEFAULT 'COP';

-- CreateTable
CREATE TABLE "SalesAccountingTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "SalesAccountingTemplateType" NOT NULL,
    "debitCashPucCuentaCode" VARCHAR(4),
    "debitCashPucSubCode" VARCHAR(6),
    "debitReceivablePucCuentaCode" VARCHAR(4),
    "debitReceivablePucSubCode" VARCHAR(6),
    "creditIncomePucCuentaCode" VARCHAR(4),
    "creditIncomePucSubCode" VARCHAR(6),
    "creditVatPucCuentaCode" VARCHAR(4),
    "creditVatPucSubCode" VARCHAR(6),
    "debitCostPucCuentaCode" VARCHAR(4),
    "debitCostPucSubCode" VARCHAR(6),
    "creditInventoryPucCuentaCode" VARCHAR(4),
    "creditInventoryPucSubCode" VARCHAR(6),
    "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0.19,
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAccountingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesAccountingTemplate_businessId_idx" ON "SalesAccountingTemplate"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesAccountingTemplate_businessId_type_key" ON "SalesAccountingTemplate"("businessId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_sourceOrderId_key" ON "AccountingEntry"("sourceOrderId");

-- CreateIndex
CREATE INDEX "AccountingEntry_sourceOrderId_idx" ON "AccountingEntry"("sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_itemId_date_startMinute_key" ON "Reservation"("itemId", "date", "startMinute");

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitCashPucCuentaCode_fkey" FOREIGN KEY ("debitCashPucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitCashPucSubCode_fkey" FOREIGN KEY ("debitCashPucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitReceivablePucCuentaCode_fkey" FOREIGN KEY ("debitReceivablePucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitReceivablePucSubCode_fkey" FOREIGN KEY ("debitReceivablePucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditIncomePucCuentaCode_fkey" FOREIGN KEY ("creditIncomePucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditIncomePucSubCode_fkey" FOREIGN KEY ("creditIncomePucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditVatPucCuentaCode_fkey" FOREIGN KEY ("creditVatPucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditVatPucSubCode_fkey" FOREIGN KEY ("creditVatPucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitCostPucCuentaCode_fkey" FOREIGN KEY ("debitCostPucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_debitCostPucSubCode_fkey" FOREIGN KEY ("debitCostPucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditInventoryPucCuentaCode_fkey" FOREIGN KEY ("creditInventoryPucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAccountingTemplate" ADD CONSTRAINT "SalesAccountingTemplate_creditInventoryPucSubCode_fkey" FOREIGN KEY ("creditInventoryPucSubCode") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
