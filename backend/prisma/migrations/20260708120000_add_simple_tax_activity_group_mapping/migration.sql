CREATE TABLE "SimpleTaxActivityGroupMapping" (
    "id" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "ciiuCode" TEXT NOT NULL,
    "ciiuDescription" TEXT,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT,
    "activityDescription" TEXT,
    "source" TEXT NOT NULL DEFAULT 'NOMINA_SIMULADOR_VENTAS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleTaxActivityGroupMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimpleTaxActivityGroupMapping_taxYear_ciiuCode_groupCode_key" ON "SimpleTaxActivityGroupMapping"("taxYear", "ciiuCode", "groupCode");
CREATE INDEX "SimpleTaxActivityGroupMapping_taxYear_ciiuCode_idx" ON "SimpleTaxActivityGroupMapping"("taxYear", "ciiuCode");
CREATE INDEX "SimpleTaxActivityGroupMapping_taxYear_groupCode_idx" ON "SimpleTaxActivityGroupMapping"("taxYear", "groupCode");
