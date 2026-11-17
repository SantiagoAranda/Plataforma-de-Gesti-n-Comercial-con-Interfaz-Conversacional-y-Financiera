-- F1.1: additive catalog attributes for Item. Existing rows keep current
-- behavior: visible in catalog, price published, no quotation text.
-- Rollback (manual, after reverting code): DROP INDEX "Item_businessId_barcode_idx";
-- then ALTER TABLE "Item" DROP COLUMN for each column below.

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "barcode" VARCHAR(64),
ADD COLUMN     "brand" VARCHAR(80),
ADD COLUMN     "categoryId" VARCHAR(64),
ADD COLUMN     "customCategoryName" VARCHAR(60),
ADD COLUMN     "customSubcategoryName" VARCHAR(60),
ADD COLUMN     "includeInQuotation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishWithoutPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quotationDescription" VARCHAR(400),
ADD COLUMN     "subcategoryId" VARCHAR(128),
ADD COLUMN     "visibleInCatalog" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Item_businessId_barcode_idx" ON "Item"("businessId", "barcode");
