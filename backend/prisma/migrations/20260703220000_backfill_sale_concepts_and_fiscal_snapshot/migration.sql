UPDATE "Item"
SET "saleConcept" = 'SERVICES'
WHERE "type" = 'SERVICE'
  AND "saleConcept" = 'GOODS';

UPDATE "Item"
SET "saleConcept" = 'GOODS'
WHERE "type" = 'PRODUCT'
  AND "saleConcept" IS NULL;

ALTER TABLE "OrderFiscalContext"
ADD COLUMN "reteIcaRateOverride" DECIMAL(6,4),
ADD COLUMN "hasMixedConcepts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mixedConceptsWarning" TEXT,
ADD COLUMN "impoconsumoRateUsed" DECIMAL(6,4);
