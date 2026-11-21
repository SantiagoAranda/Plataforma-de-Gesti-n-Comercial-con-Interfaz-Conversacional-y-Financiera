-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'CONVERTED');

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'OPEN',
    "origin" "SaleOrigin" NOT NULL DEFAULT 'MANUAL',
    "customerName" TEXT,
    "customerWhatsapp" TEXT,
    "customerEmail" TEXT,
    "customerDocument" TEXT,
    "note" VARCHAR(1000),
    "validityDays" INTEGER NOT NULL DEFAULT 15,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "requestKeyHash" TEXT,
    "requestFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "itemId" TEXT,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" VARCHAR(400),
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2),

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_publicToken_key" ON "Quotation"("publicToken");

-- CreateIndex
CREATE INDEX "Quotation_businessId_status_idx" ON "Quotation"("businessId", "status");

-- CreateIndex
CREATE INDEX "Quotation_businessId_createdAt_idx" ON "Quotation"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_businessId_number_key" ON "Quotation"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_businessId_requestKeyHash_key" ON "Quotation"("businessId", "requestKeyHash");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

