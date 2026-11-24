-- Additive: preserve existing service behavior and all commercial/history records.
ALTER TABLE "Item"
  ADD COLUMN "requiresAppointment" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowWalkIn" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Item" SET "requiresAppointment" = false, "allowWalkIn" = false
WHERE "type" = 'PRODUCT';
