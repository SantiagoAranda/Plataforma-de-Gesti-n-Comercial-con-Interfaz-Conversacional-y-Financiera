-- Add JSON badges array (supports multiple badges while keeping legacy columns)
ALTER TABLE "Item"
ADD COLUMN     "badges" JSONB;

