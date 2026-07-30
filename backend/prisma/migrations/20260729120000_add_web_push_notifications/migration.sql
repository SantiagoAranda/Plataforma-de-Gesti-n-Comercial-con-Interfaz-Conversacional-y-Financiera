-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM (
  'WEB_WINDOWS',
  'WEB_ANDROID',
  'WEB_IOS',
  'WEB_MACOS',
  'WEB_LINUX',
  'WEB_DESKTOP',
  'UNKNOWN'
);

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "notifyOnAutomaticSale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "publicRequestId" TEXT,
ADD COLUMN "publicRequestFingerprint" TEXT;

-- CreateTable
CREATE TABLE "PushSubscription" (
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
CREATE UNIQUE INDEX "Order_businessId_publicRequestId_key"
ON "Order"("businessId", "publicRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key"
ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_deviceId_key"
ON "PushSubscription"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "PushSubscription_businessId_enabled_idx"
ON "PushSubscription"("businessId", "enabled");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx"
ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
