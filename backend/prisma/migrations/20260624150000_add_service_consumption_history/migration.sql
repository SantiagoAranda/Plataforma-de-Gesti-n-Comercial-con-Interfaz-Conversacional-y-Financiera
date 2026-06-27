-- AlterEnum
ALTER TYPE "InventoryReferenceType" ADD VALUE 'RESERVATION';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "reservationId" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "inventoryPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ServiceIngredient" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityRequired" DECIMAL(20,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceIngredient_businessId_idx" ON "ServiceIngredient"("businessId");
CREATE INDEX "ServiceIngredient_serviceItemId_idx" ON "ServiceIngredient"("serviceItemId");
CREATE INDEX "ServiceIngredient_ingredientId_idx" ON "ServiceIngredient"("ingredientId");
CREATE UNIQUE INDEX "ServiceIngredient_businessId_serviceItemId_ingredientId_key"
ON "ServiceIngredient"("businessId", "serviceItemId", "ingredientId");

CREATE INDEX "InventoryMovement_businessId_reservationId_idx"
ON "InventoryMovement"("businessId", "reservationId");
CREATE UNIQUE INDEX "InventoryMovement_businessId_reservationId_ingredientId_typ_key"
ON "InventoryMovement"("businessId", "reservationId", "ingredientId", "type");

CREATE INDEX "Reservation_businessId_inventoryPostedAt_idx"
ON "Reservation"("businessId", "inventoryPostedAt");
CREATE UNIQUE INDEX "Reservation_id_businessId_key"
ON "Reservation"("id", "businessId");

-- AddForeignKey
ALTER TABLE "ServiceIngredient"
ADD CONSTRAINT "ServiceIngredient_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceIngredient"
ADD CONSTRAINT "ServiceIngredient_serviceItemId_businessId_fkey"
FOREIGN KEY ("serviceItemId", "businessId") REFERENCES "Item"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceIngredient"
ADD CONSTRAINT "ServiceIngredient_ingredientId_businessId_fkey"
FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_reservationId_businessId_fkey"
FOREIGN KEY ("reservationId", "businessId") REFERENCES "Reservation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
