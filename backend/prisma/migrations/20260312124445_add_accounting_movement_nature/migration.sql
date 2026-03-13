/*
  Warnings:

  - You are about to drop the column `pucCode` on the `AccountingMovement` table. All the data in the column will be lost.
  - You are about to drop the column `pucName` on the `AccountingMovement` table. All the data in the column will be lost.
  - You are about to drop the `AccountingEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AccountingLine` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MovementNature" AS ENUM ('DEBIT', 'CREDIT');

-- DropForeignKey
ALTER TABLE "AccountingEntry" DROP CONSTRAINT "AccountingEntry_businessId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingEntry" DROP CONSTRAINT "AccountingEntry_sourceOrderId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLine" DROP CONSTRAINT "AccountingLine_entryId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLine" DROP CONSTRAINT "AccountingLine_pucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLine" DROP CONSTRAINT "AccountingLine_pucSubCode_fkey";

-- DropForeignKey
ALTER TABLE "AccountingMovement" DROP CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey";

-- DropIndex
DROP INDEX "AccountingMovement_originType_idx";

-- DropIndex
DROP INDEX "AccountingMovement_pucSubcuentaId_idx";

-- AlterTable
ALTER TABLE "AccountingMovement" DROP COLUMN "pucCode",
DROP COLUMN "pucName",
ADD COLUMN     "nature" "MovementNature" NOT NULL DEFAULT 'DEBIT',
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "pucSubcuentaId" SET DATA TYPE TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "AccountingEntry";

-- DropTable
DROP TABLE "AccountingLine";

-- DropEnum
DROP TYPE "AccountingEntryStatus";

-- AddForeignKey
ALTER TABLE "AccountingMovement" ADD CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey" FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
