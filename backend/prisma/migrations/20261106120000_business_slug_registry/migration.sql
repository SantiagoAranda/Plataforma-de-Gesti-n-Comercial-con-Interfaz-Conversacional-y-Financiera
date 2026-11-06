BEGIN;

-- Writers must remain paused until the compatible application is deployed.
LOCK TABLE "Business" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "BusinessSlug" (
  "slug" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessSlug_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "BusinessSlug_businessId_idx" ON "BusinessSlug"("businessId");
ALTER TABLE "BusinessSlug" ADD CONSTRAINT "BusinessSlug_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy identifiers byte-for-byte, including values invalid for new slugs.
INSERT INTO "BusinessSlug" ("slug", "businessId", "createdAt")
SELECT "slug", "id", CURRENT_TIMESTAMP FROM "Business";

COMMIT;
