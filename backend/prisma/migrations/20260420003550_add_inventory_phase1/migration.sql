/*
  Warnings:

  - You are about to drop the column `mimeType` on the `ItemImage` table. All the data in the column will be lost.
  - You are about to drop the column `pathname` on the `ItemImage` table. All the data in the column will be lost.
  - You are about to drop the column `sizeBytes` on the `ItemImage` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id,businessId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,businessId]` on the table `OrderItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('FOOD', 'RETAIL', 'BEAUTY', 'SERVICES');

-- CreateEnum
CREATE TYPE "InventoryMode" AS ENUM ('NONE', 'SIMPLE', 'RECIPE_BASED');

-- CreateEnum
CREATE TYPE "IngredientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INVENTORY_INITIAL', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE');

-- CreateEnum
CREATE TYPE "InventoryReferenceType" AS ENUM ('ORDER', 'ORDER_ITEM', 'MANUAL', 'PURCHASE_MANUAL');

-- DropIndex
DROP INDEX "OrderItem_orderId_itemId_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "businessCategory" "BusinessCategory" NOT NULL DEFAULT 'RETAIL';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "inventoryMode" "InventoryMode" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "ItemImage" DROP COLUMN "mimeType",
DROP COLUMN "pathname",
DROP COLUMN "sizeBytes";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "inventoryPostedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "inventoryModeSnapshot" "InventoryMode";

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IngredientStatus" NOT NULL DEFAULT 'ACTIVE',
    "consumptionUnit" VARCHAR(20) NOT NULL,
    "purchaseUnit" VARCHAR(20) NOT NULL,
    "purchaseToConsumptionFactor" DECIMAL(20,6) NOT NULL,
    "currentStock" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityRequired" DECIMAL(20,6) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6) NOT NULL,
    "totalValue" DECIMAL(20,6) NOT NULL,
    "stockAfter" DECIMAL(20,6) NOT NULL,
    "averageCostAfter" DECIMAL(20,6) NOT NULL,
    "referenceType" "InventoryReferenceType" NOT NULL,
    "referenceId" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "detail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ingredient_businessId_idx" ON "Ingredient"("businessId");

-- CreateIndex
CREATE INDEX "Ingredient_businessId_status_idx" ON "Ingredient"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_businessId_name_key" ON "Ingredient"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_id_businessId_key" ON "Ingredient"("id", "businessId");

-- CreateIndex
CREATE INDEX "Recipe_businessId_idx" ON "Recipe"("businessId");

-- CreateIndex
CREATE INDEX "Recipe_businessId_itemId_idx" ON "Recipe"("businessId", "itemId");

-- CreateIndex
CREATE INDEX "Recipe_businessId_ingredientId_idx" ON "Recipe"("businessId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_businessId_itemId_ingredientId_key" ON "Recipe"("businessId", "itemId", "ingredientId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_occurredAt_idx" ON "InventoryMovement"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_ingredientId_occurredAt_idx" ON "InventoryMovement"("businessId", "ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_type_idx" ON "InventoryMovement"("businessId", "type");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_referenceType_referenceId_idx" ON "InventoryMovement"("businessId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_orderId_idx" ON "InventoryMovement"("businessId", "orderId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_orderItemId_idx" ON "InventoryMovement"("businessId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_businessId_orderItemId_ingredientId_type_key" ON "InventoryMovement"("businessId", "orderItemId", "ingredientId", "type");

-- CreateIndex
CREATE INDEX "Business_businessCategory_idx" ON "Business"("businessCategory");

-- CreateIndex
CREATE INDEX "Item_businessId_inventoryMode_idx" ON "Item"("businessId", "inventoryMode");

-- CreateIndex
CREATE INDEX "Order_businessId_inventoryPostedAt_idx" ON "Order"("businessId", "inventoryPostedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_businessId_key" ON "Order"("id", "businessId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_itemId_idx" ON "OrderItem"("orderId", "itemId");

-- CreateIndex
CREATE INDEX "OrderItem_businessId_itemId_idx" ON "OrderItem"("businessId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_id_businessId_key" ON "OrderItem"("id", "businessId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_itemId_businessId_fkey" FOREIGN KEY ("itemId", "businessId") REFERENCES "Item"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_ingredientId_businessId_fkey" FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_businessId_fkey" FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_businessId_fkey" FOREIGN KEY ("orderId", "businessId") REFERENCES "Order"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderItemId_businessId_fkey" FOREIGN KEY ("orderItemId", "businessId") REFERENCES "OrderItem"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
