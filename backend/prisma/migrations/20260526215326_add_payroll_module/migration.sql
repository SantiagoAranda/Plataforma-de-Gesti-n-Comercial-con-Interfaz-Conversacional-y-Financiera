/*
  Warnings:

  - You are about to alter the column `code` on the `EconomicActivityCiiu` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(8)`.

*/
-- AlterTable
ALTER TABLE "EconomicActivityCiiu" ALTER COLUMN "code" SET DATA TYPE VARCHAR(8);
