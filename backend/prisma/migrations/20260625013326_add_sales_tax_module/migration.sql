-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('NATURAL', 'JURIDICA');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CC', 'NIT', 'CE', 'PASAPORTE', 'TI');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('IVA', 'IMPOCONSUMO', 'RETEFUENTE', 'RETEIVA', 'RETEICA', 'AUTORRETENCION');

-- CreateEnum
CREATE TYPE "TaxDirection" AS ENUM ('CHARGE', 'WITHHOLD', 'SELF');

-- CreateEnum
CREATE TYPE "SaleConcept" AS ENUM ('GOODS', 'SERVICES', 'HONORARIOS', 'ARRENDAMIENTOS', 'FOOD_BEVERAGES', 'OTHER');

-- AlterTable
ALTER TABLE "AccountingMovement" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "appliesImpoconsumo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "impoconsumoRate" DECIMAL(6,4);

-- CreateTable
CREATE TABLE "TaxGlobalParameter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "uvt" DECIMAL(10,2) NOT NULL,
    "defaultVatRate" DECIMAL(5,4) NOT NULL,
    "defaultImpoconsumoRate" DECIMAL(5,4),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxGlobalParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTaxProfile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "personType" "PersonType" NOT NULL DEFAULT 'NATURAL',
    "documentType" "DocumentType" NOT NULL DEFAULT 'NIT',
    "nit" TEXT NOT NULL,
    "dv" TEXT,
    "tradeName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mainCiiuCode" TEXT,
    "mainCiiuDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxResponsibility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "TaxResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTaxResponsibility" (
    "id" TEXT NOT NULL,
    "taxProfileId" TEXT NOT NULL,
    "taxResponsibilityId" TEXT NOT NULL,

    CONSTRAINT "BusinessTaxResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalityIcaRate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "ciiuCode" TEXT NOT NULL,
    "activityName" TEXT,
    "icaRate" DECIMAL(6,4) NOT NULL,
    "reteIcaRate" DECIMAL(6,4) NOT NULL,
    "minBaseUvt" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalityIcaRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTaxRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "direction" "TaxDirection" NOT NULL,
    "ciiuCode" TEXT,
    "saleConcept" "SaleConcept",
    "rate" DECIMAL(6,4) NOT NULL,
    "minBaseUvt" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pucAccountCode" TEXT NOT NULL,
    "postToAccounting" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFiscalContext" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerType" "PersonType",
    "buyerName" TEXT,
    "buyerDocumentType" "DocumentType",
    "buyerDocumentNumber" TEXT,
    "buyerEmail" TEXT,
    "buyerIsIvaResponsable" BOOLEAN NOT NULL DEFAULT false,
    "buyerIsRetenedor" BOOLEAN NOT NULL DEFAULT false,
    "buyerIsGranContribuyente" BOOLEAN NOT NULL DEFAULT false,
    "buyerIsAutorretenedor" BOOLEAN NOT NULL DEFAULT false,
    "buyerIsRegimenSimple" BOOLEAN NOT NULL DEFAULT false,
    "fiscalMunicipalityCode" TEXT,
    "saleConcept" "SaleConcept",
    "subtotal" DECIMAL(14,2) NOT NULL,
    "chargedTaxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withheldTaxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netReceived" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFiscalContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleTaxLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "direction" "TaxDirection" NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "accountCode" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCalculationSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "uvtValue" DECIMAL(10,2) NOT NULL,
    "sellerFiscal" JSONB NOT NULL,
    "buyerFiscal" JSONB NOT NULL,
    "rawCalculation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCalculationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxGlobalParameter_year_key" ON "TaxGlobalParameter"("year");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTaxProfile_businessId_key" ON "BusinessTaxProfile"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTaxProfile_businessId_nit_key" ON "BusinessTaxProfile"("businessId", "nit");

-- CreateIndex
CREATE UNIQUE INDEX "TaxResponsibility_code_key" ON "TaxResponsibility"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTaxResponsibility_taxProfileId_taxResponsibilityId_key" ON "BusinessTaxResponsibility"("taxProfileId", "taxResponsibilityId");

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalityIcaRate_businessId_municipalityCode_ciiuCode_key" ON "MunicipalityIcaRate"("businessId", "municipalityCode", "ciiuCode");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFiscalContext_orderId_key" ON "OrderFiscalContext"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCalculationSnapshot_orderId_key" ON "TaxCalculationSnapshot"("orderId");

-- AddForeignKey
ALTER TABLE "BusinessTaxProfile" ADD CONSTRAINT "BusinessTaxProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTaxResponsibility" ADD CONSTRAINT "BusinessTaxResponsibility_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "BusinessTaxProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTaxResponsibility" ADD CONSTRAINT "BusinessTaxResponsibility_taxResponsibilityId_fkey" FOREIGN KEY ("taxResponsibilityId") REFERENCES "TaxResponsibility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalityIcaRate" ADD CONSTRAINT "MunicipalityIcaRate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTaxRule" ADD CONSTRAINT "SalesTaxRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFiscalContext" ADD CONSTRAINT "OrderFiscalContext_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTaxLine" ADD CONSTRAINT "SaleTaxLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCalculationSnapshot" ADD CONSTRAINT "TaxCalculationSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
