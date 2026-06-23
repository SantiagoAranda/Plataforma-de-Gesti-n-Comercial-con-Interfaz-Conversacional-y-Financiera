-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "averageCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
ADD COLUMN     "currentStock" DECIMAL(20,6) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Item_businessId_status_type_idx" ON "Item"("businessId", "status", "type");

-- CreateIndex
CREATE INDEX "Item_businessId_inventoryMode_idx" ON "Item"("businessId", "inventoryMode");

-- Existing data was audited before creating these defensive constraints.
ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "chk_inventory_movement_exactly_one_target"
CHECK (
  ("ingredientId" IS NOT NULL AND "itemId" IS NULL)
  OR
  ("ingredientId" IS NULL AND "itemId" IS NOT NULL)
);

ALTER TABLE "Ingredient"
ADD CONSTRAINT "chk_ingredient_current_stock_non_negative"
CHECK ("currentStock" >= 0);

ALTER TABLE "Item"
ADD CONSTRAINT "chk_item_current_stock_non_negative"
CHECK ("currentStock" >= 0);
