-- AlterTable
ALTER TABLE "ItemImage" 
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "pathname" TEXT,
ADD COLUMN     "sizeBytes" INTEGER;
