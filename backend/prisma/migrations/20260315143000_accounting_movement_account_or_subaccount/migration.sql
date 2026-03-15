ALTER TABLE "AccountingMovement"
ADD COLUMN "pucCuentaCode" VARCHAR(4),
ALTER COLUMN "pucSubcuentaId" DROP NOT NULL;

CREATE INDEX "AccountingMovement_pucCuentaCode_idx" ON "AccountingMovement"("pucCuentaCode");
CREATE INDEX "AccountingMovement_pucSubcuentaId_idx" ON "AccountingMovement"("pucSubcuentaId");

ALTER TABLE "AccountingMovement"
ADD CONSTRAINT "AccountingMovement_pucCuentaCode_fkey"
FOREIGN KEY ("pucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingMovement"
DROP CONSTRAINT IF EXISTS "AccountingMovement_pucSubcuentaId_fkey";

ALTER TABLE "AccountingMovement"
ADD CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey"
FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingMovement"
ADD CONSTRAINT "ck_accounting_movement_puc_xor"
CHECK (
  (CASE WHEN "pucCuentaCode" IS NULL THEN 0 ELSE 1 END) +
  (CASE WHEN "pucSubcuentaId" IS NULL THEN 0 ELSE 1 END) = 1
);
