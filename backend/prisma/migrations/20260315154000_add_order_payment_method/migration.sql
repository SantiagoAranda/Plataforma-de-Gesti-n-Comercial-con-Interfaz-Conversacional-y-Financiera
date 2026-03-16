CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

ALTER TABLE "Order"
ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
