-- Correct SIMPLE inventory to use Item stock directly, not artificial Ingredient links.
-- This migration is safe to apply after the previous local SIMPLE-link migration:
-- it drops those columns if they exist and adds InventoryMovement.itemId.

ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_ingredientId_businessId_fkey";
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_simpleIngredientId_businessId_fkey";
DROP INDEX IF EXISTS "Item_businessId_simpleIngredientId_idx";

ALTER TABLE "Item" DROP COLUMN IF EXISTS "simpleIngredientId";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "simpleIngredientIdSnapshot";

ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "itemId" TEXT;
ALTER TABLE "InventoryMovement" ALTER COLUMN "ingredientId" DROP NOT NULL;

-- Legacy sale movements for SIMPLE items that were created through the old one-line
-- recipe convention represent direct product stock. Move them to itemId when the
-- movement can be unambiguously tied to a SIMPLE order item.
UPDATE "InventoryMovement" im
SET "itemId" = oi."itemId",
    "ingredientId" = NULL
FROM "OrderItem" oi
WHERE im."businessId" = oi."businessId"
  AND im."orderItemId" = oi."id"
  AND oi."inventoryModeSnapshot" = 'SIMPLE'
  AND im."itemId" IS NULL
  AND im."ingredientId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_businessId_orderItemId_itemId_type_key"
ON "InventoryMovement"("businessId", "orderItemId", "itemId", "type");

CREATE INDEX IF NOT EXISTS "InventoryMovement_businessId_itemId_occurredAt_idx"
ON "InventoryMovement"("businessId", "itemId", "occurredAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_businessId_fkey"
FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_businessId_fkey"
FOREIGN KEY ("itemId", "businessId") REFERENCES "Item"("id", "businessId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_exactly_one_stock_target_chk";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_exactly_one_stock_target_chk"
CHECK (
  ("itemId" IS NOT NULL AND "ingredientId" IS NULL)
  OR
  ("itemId" IS NULL AND "ingredientId" IS NOT NULL)
);
