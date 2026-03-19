-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;
