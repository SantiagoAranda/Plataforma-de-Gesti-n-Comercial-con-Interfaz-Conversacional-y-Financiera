-- Bloque 2.2: additive only. Existing rows stay on policy 1 with NULL snapshots
-- (no retroactive prices, dates or keys are inferred).
ALTER TABLE "Business"
  ADD COLUMN "reservationPolicyV2Enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Reservation"
  ADD COLUMN "commercialPolicyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "priceSnapshot" DECIMAL(10,2),
  ADD COLUMN "accountingPostedAt" TIMESTAMP(3),
  ADD COLUMN "publicRequestId" TEXT,
  ADD COLUMN "publicRequestFingerprint" TEXT;

-- publicRequestId stores sha256(businessId:key), never the raw key. NULLs never collide.
CREATE UNIQUE INDEX "Reservation_businessId_publicRequestId_key"
  ON "Reservation"("businessId", "publicRequestId");
