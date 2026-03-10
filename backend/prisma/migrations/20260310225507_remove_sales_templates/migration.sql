/*
  Warnings:

  - You are about to drop the `SalesAccountingTemplate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_businessId_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditIncomePucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditIncomePucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditInventoryPucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditInventoryPucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditVatPucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_creditVatPucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitCashPucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitCashPucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitCostPucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitCostPucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitReceivablePucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "SalesAccountingTemplate" DROP CONSTRAINT "SalesAccountingTemplate_debitReceivablePucSubCode_fkey";

-- DropTable
DROP TABLE "SalesAccountingTemplate";

-- DropEnum
DROP TYPE "SalesAccountingTemplateType";
