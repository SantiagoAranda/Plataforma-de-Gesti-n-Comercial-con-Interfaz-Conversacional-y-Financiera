/*
  Warnings:

  - A unique constraint covering the columns `[publicToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - The required column `publicToken` was added to the `Order` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "publicToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");
