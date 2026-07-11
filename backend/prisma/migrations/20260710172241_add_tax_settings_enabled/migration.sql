-- AlterTable
ALTER TABLE "BusinessTaxProfile" ADD COLUMN     "taxSettingsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing profiles to have taxSettingsEnabled = true
UPDATE "BusinessTaxProfile" SET "taxSettingsEnabled" = true;
