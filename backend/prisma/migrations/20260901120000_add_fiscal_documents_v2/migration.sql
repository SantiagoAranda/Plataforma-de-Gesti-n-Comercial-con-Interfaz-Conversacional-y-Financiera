-- Facturación electrónica V2. Deliberately independent from legacy fiscal schemas.
CREATE TYPE "FiscalDocumentType" AS ENUM ('INVOICE', 'CREDIT_NOTE');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUBMITTED_PENDING_DIAN', 'VALIDATED', 'REJECTED', 'RETRYABLE_FAILURE', 'CREDITED');
CREATE TYPE "FiscalAttemptResult" AS ENUM ('STARTED', 'SUCCEEDED', 'RETRYABLE_FAILURE', 'REJECTED');

ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Item" ADD COLUMN "fiscalCode" TEXT,
ADD COLUMN "factusUnitMeasureCode" TEXT,
ADD COLUMN "factusStandardCode" TEXT;

CREATE TABLE "FactusConfiguration" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "encryptedCredentials" TEXT,
  "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "invoiceRangeId" INTEGER,
  "creditNoteRangeId" INTEGER,
  "defaultPaymentForm" TEXT,
  "defaultPaymentMethod" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactusConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDocument" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "parentDocumentId" TEXT,
  "type" "FiscalDocumentType" NOT NULL,
  "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "sequenceScope" TEXT NOT NULL DEFAULT 'PRIMARY',
  "referenceCode" TEXT NOT NULL,
  "factusNumber" TEXT,
  "cufeOrCude" TEXT,
  "dianValidatedAt" TIMESTAMP(3),
  "providerResponse" JSONB,
  "providerErrors" JSONB,
  "sellerSnapshot" JSONB NOT NULL,
  "buyerSnapshot" JSONB NOT NULL,
  "itemsSnapshot" JSONB NOT NULL,
  "taxSnapshot" JSONB NOT NULL,
  "paymentSnapshot" JSONB NOT NULL,
  "payloadSnapshot" JSONB NOT NULL,
  "fiscalFingerprint" TEXT NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "reversalRequestedAt" TIMESTAMP(3),
  "reversalAppliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDocumentAttempt" (
  "id" TEXT NOT NULL,
  "fiscalDocumentId" TEXT NOT NULL,
  "result" "FiscalAttemptResult" NOT NULL DEFAULT 'STARTED',
  "httpStatus" INTEGER,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FiscalDocumentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDocumentArtifact" (
  "id" TEXT NOT NULL,
  "fiscalDocumentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalDocumentArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_businessId_idempotencyKey_key" ON "Order"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "FactusConfiguration_businessId_key" ON "FactusConfiguration"("businessId");
CREATE UNIQUE INDEX "FiscalDocument_referenceCode_key" ON "FiscalDocument"("referenceCode");
CREATE UNIQUE INDEX "FiscalDocument_businessId_type_orderId_sequenceScope_key" ON "FiscalDocument"("businessId", "type", "orderId", "sequenceScope");
CREATE INDEX "FiscalDocument_businessId_status_createdAt_idx" ON "FiscalDocument"("businessId", "status", "createdAt");
CREATE INDEX "FiscalDocument_orderId_idx" ON "FiscalDocument"("orderId");
CREATE INDEX "FiscalDocumentAttempt_fiscalDocumentId_startedAt_idx" ON "FiscalDocumentAttempt"("fiscalDocumentId", "startedAt");
CREATE UNIQUE INDEX "FiscalDocumentArtifact_fiscalDocumentId_kind_key" ON "FiscalDocumentArtifact"("fiscalDocumentId", "kind");

ALTER TABLE "FactusConfiguration" ADD CONSTRAINT "FactusConfiguration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalDocumentAttempt" ADD CONSTRAINT "FiscalDocumentAttempt_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocumentArtifact" ADD CONSTRAINT "FiscalDocumentArtifact_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
