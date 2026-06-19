-- CreateEnum
CREATE TYPE "ItemOptionQuantityMode" AS ENUM ('FIXED_PER_OPTION', 'SHARED_TOTAL', 'NO_QUANTITY');

-- CreateEnum
CREATE TYPE "ItemOptionTargetType" AS ENUM ('NONE', 'INGREDIENT', 'ITEM');

-- CreateEnum
CREATE TYPE "OrderItemOptionAction" AS ENUM ('SELECT', 'ADD', 'REMOVE');

-- AlterTable
ALTER TABLE "OrderItem"
ADD COLUMN "baseUnitPriceSnapshot" DECIMAL(10,2),
ADD COLUMN "optionsTotalSnapshot" DECIMAL(10,2),
ADD COLUMN "finalUnitPriceSnapshot" DECIMAL(10,2),
ADD COLUMN "lineTotalSnapshot" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "ItemOptionGroup" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER,
    "quantityMode" "ItemOptionQuantityMode" NOT NULL DEFAULT 'NO_QUANTITY',
    "totalQuantityLimit" DECIMAL(20,6),
    "totalQuantityUnitId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOption" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetType" "ItemOptionTargetType" NOT NULL DEFAULT 'NONE',
    "ingredientId" TEXT,
    "itemId" TEXT,
    "quantity" DECIMAL(20,6),
    "unitId" TEXT,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "selectedByDefault" BOOLEAN NOT NULL DEFAULT false,
    "removable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemOption" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "groupId" TEXT,
    "optionId" TEXT,
    "groupTitleSnapshot" TEXT NOT NULL,
    "optionNameSnapshot" TEXT NOT NULL,
    "targetTypeSnapshot" "ItemOptionTargetType" NOT NULL,
    "ingredientId" TEXT,
    "itemId" TEXT,
    "quantityModeSnapshot" "ItemOptionQuantityMode" NOT NULL,
    "quantityPerUnitSnapshot" DECIMAL(20,6),
    "totalQuantitySnapshot" DECIMAL(20,6),
    "unitIdSnapshot" TEXT,
    "unitLabelSnapshot" TEXT,
    "priceDeltaSnapshot" DECIMAL(10,2) NOT NULL,
    "selectedByDefaultSnapshot" BOOLEAN NOT NULL,
    "action" "OrderItemOptionAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemOptionGroup_businessId_itemId_isActive_sortOrder_idx" ON "ItemOptionGroup"("businessId", "itemId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ItemOptionGroup_businessId_idx" ON "ItemOptionGroup"("businessId");

-- CreateIndex
CREATE INDEX "ItemOptionGroup_businessId_itemId_idx" ON "ItemOptionGroup"("businessId", "itemId");

-- CreateIndex
CREATE INDEX "ItemOptionGroup_totalQuantityUnitId_idx" ON "ItemOptionGroup"("totalQuantityUnitId");

-- CreateIndex
CREATE INDEX "ItemOption_groupId_isActive_sortOrder_idx" ON "ItemOption"("groupId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ItemOption_groupId_idx" ON "ItemOption"("groupId");

-- CreateIndex
CREATE INDEX "ItemOption_businessId_idx" ON "ItemOption"("businessId");

-- CreateIndex
CREATE INDEX "ItemOption_businessId_groupId_idx" ON "ItemOption"("businessId", "groupId");

-- CreateIndex
CREATE INDEX "ItemOption_ingredientId_idx" ON "ItemOption"("ingredientId");

-- CreateIndex
CREATE INDEX "ItemOption_itemId_idx" ON "ItemOption"("itemId");

-- CreateIndex
CREATE INDEX "ItemOption_unitId_idx" ON "ItemOption"("unitId");

-- CreateIndex
CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemOption_groupId_idx" ON "OrderItemOption"("groupId");

-- CreateIndex
CREATE INDEX "OrderItemOption_optionId_idx" ON "OrderItemOption"("optionId");

-- CreateIndex
CREATE INDEX "OrderItemOption_ingredientId_idx" ON "OrderItemOption"("ingredientId");

-- CreateIndex
CREATE INDEX "OrderItemOption_itemId_idx" ON "OrderItemOption"("itemId");

-- AddForeignKey
ALTER TABLE "ItemOptionGroup" ADD CONSTRAINT "ItemOptionGroup_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOptionGroup" ADD CONSTRAINT "ItemOptionGroup_itemId_businessId_fkey" FOREIGN KEY ("itemId", "businessId") REFERENCES "Item"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOptionGroup" ADD CONSTRAINT "ItemOptionGroup_totalQuantityUnitId_fkey" FOREIGN KEY ("totalQuantityUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOption" ADD CONSTRAINT "ItemOption_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOption" ADD CONSTRAINT "ItemOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ItemOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOption" ADD CONSTRAINT "ItemOption_ingredientId_businessId_fkey" FOREIGN KEY ("ingredientId", "businessId") REFERENCES "Ingredient"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOption" ADD CONSTRAINT "ItemOption_itemId_businessId_fkey" FOREIGN KEY ("itemId", "businessId") REFERENCES "Item"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOption" ADD CONSTRAINT "ItemOption_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ItemOptionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ItemOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
