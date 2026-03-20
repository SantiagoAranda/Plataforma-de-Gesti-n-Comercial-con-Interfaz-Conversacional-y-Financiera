-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "customerName" DROP NOT NULL,
ALTER COLUMN "customerWhatsapp" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Reservation" ALTER COLUMN "customerName" DROP NOT NULL,
ALTER COLUMN "customerWhatsapp" DROP NOT NULL;
