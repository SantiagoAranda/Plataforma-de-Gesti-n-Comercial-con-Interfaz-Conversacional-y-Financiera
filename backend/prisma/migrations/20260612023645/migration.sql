-- DropIndex
DROP INDEX "Item_businessId_inventoryMode_idx";

-- CreateIndex
CREATE INDEX "Item_inventoryMode_idx" ON "Item"("inventoryMode");
