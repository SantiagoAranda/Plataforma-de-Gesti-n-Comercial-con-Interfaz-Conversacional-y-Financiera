-- CreateTable
CREATE TABLE "StoreFooterSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT,
    "phones" JSONB,
    "socials" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreFooterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreFooterSettings_businessId_key" ON "StoreFooterSettings"("businessId");

-- AddForeignKey
ALTER TABLE "StoreFooterSettings" ADD CONSTRAINT "StoreFooterSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
