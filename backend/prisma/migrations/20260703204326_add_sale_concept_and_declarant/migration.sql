-- AlterTable
ALTER TABLE "BusinessTaxProfile" ADD COLUMN     "isIncomeTaxDeclarant" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "saleConcept" "SaleConcept" NOT NULL DEFAULT 'GOODS';

-- AlterTable
ALTER TABLE "OrderFiscalContext" ADD COLUMN     "icaRateUsed" DECIMAL(6,4),
ADD COLUMN     "reteIcaRateUsed" DECIMAL(6,4),
ADD COLUMN     "sellerIsIncomeTaxDeclarant" BOOLEAN,
ADD COLUMN     "sellerIsSimpleRegime" BOOLEAN,
ADD COLUMN     "sellerPersonType" "PersonType",
ADD COLUMN     "taxYear" INTEGER,
ADD COLUMN     "uvtValue" DECIMAL(10,2);
