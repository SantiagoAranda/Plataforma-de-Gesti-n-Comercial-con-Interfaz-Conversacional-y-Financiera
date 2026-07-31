/*
Warnings:
- A unique constraint covering the columns `[businessId,publicRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
*/

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PushPlatform" AS ENUM ('WEB_WINDOWS', 'WEB_ANDROID', 'WEB_IOS', 'WEB_MACOS', 'WEB_LINUX', 'WEB_DESKTOP', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Business
ALTER TABLE "Business"
ADD COLUMN IF NOT EXISTS "notifyOnAutomaticSale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Order
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "publicRequestFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "publicRequestId" TEXT;

-- CreateTable PushSubscription
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "expirationTime" TIMESTAMP(3),
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "userAgent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription" ("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_businessId_enabled_idx" ON "PushSubscription" ("businessId", "enabled");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_userId_deviceId_key" ON "PushSubscription" ("userId", "deviceId");

CREATE INDEX IF NOT EXISTS "AccountingMovement_businessId_originType_originId_accountin_idx" ON "AccountingMovement" (
    "businessId",
    "originType",
    "originId",
    "accountingRole"
);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_businessId_publicRequestId_key" ON "Order" (
    "businessId",
    "publicRequestId"
);

-- AddForeignKey (Ensuciado con bloque seguro para evitar duplica de constraints)
DO $$ BEGIN
    ALTER TABLE "PushSubscription"
    ADD CONSTRAINT "PushSubscription_businessId_fkey" 
    FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

EXCEPTION WHEN duplicate_object THEN null;

END $$;

DO $$ BEGIN
    ALTER TABLE "PushSubscription"
    ADD CONSTRAINT "PushSubscription_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;