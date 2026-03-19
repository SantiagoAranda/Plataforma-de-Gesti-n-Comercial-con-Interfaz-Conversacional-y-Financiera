-- CreateEnum
CREATE TYPE "SaleOrigin" AS ENUM ('MANUAL', 'PUBLIC_STORE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "origin" "SaleOrigin" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "origin" "SaleOrigin" NOT NULL DEFAULT 'MANUAL';
