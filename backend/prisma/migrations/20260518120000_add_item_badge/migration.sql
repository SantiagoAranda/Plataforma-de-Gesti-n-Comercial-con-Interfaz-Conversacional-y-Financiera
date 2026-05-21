-- Add optional badge fields for catalog items
ALTER TABLE "Item"
ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "badgeColor" TEXT;

