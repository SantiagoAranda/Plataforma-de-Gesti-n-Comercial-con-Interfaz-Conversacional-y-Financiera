-- CreateTable
CREATE TABLE "OrderSignedDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSignedDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderSignedDelivery_orderId_key" ON "OrderSignedDelivery"("orderId");

-- AddForeignKey
ALTER TABLE "OrderSignedDelivery" ADD CONSTRAINT "OrderSignedDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

