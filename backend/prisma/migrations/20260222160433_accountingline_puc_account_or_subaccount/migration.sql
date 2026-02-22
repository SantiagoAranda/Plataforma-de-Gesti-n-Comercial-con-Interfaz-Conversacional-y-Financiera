-- AlterTable
ALTER TABLE "AccountingLine" ADD COLUMN     "pucCuentaCode" VARCHAR(4),
ALTER COLUMN "pucSubCode" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AccountingLine_pucCuentaCode_idx" ON "AccountingLine"("pucCuentaCode");

-- AddForeignKey
ALTER TABLE "AccountingLine" ADD CONSTRAINT "AccountingLine_pucCuentaCode_fkey" FOREIGN KEY ("pucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingLine"
ADD CONSTRAINT "ck_accountingline_puc_xor"
CHECK (
  (("pucCuentaCode" IS NOT NULL)::int + ("pucSubCode" IS NOT NULL)::int) = 1
);

ALTER TABLE "AccountingLine"
ADD CONSTRAINT "ck_accountingline_debit_credit"
CHECK (
  "debit" >= 0 AND
  "credit" >= 0 AND
  (
    ("debit" > 0 AND "credit" = 0) OR
    ("credit" > 0 AND "debit" = 0)
  )
);

ALTER TABLE "PucGrupo"
ADD CONSTRAINT "ck_pucgrupo_prefix"
CHECK (left("code", 1) = "claseCode");

ALTER TABLE "PucCuenta"
ADD CONSTRAINT "ck_puccuenta_prefix"
CHECK (left("code", 2) = "grupoCode");

ALTER TABLE "PucSubcuenta"
ADD CONSTRAINT "ck_pucsubcuenta_prefix"
CHECK (left("code", 4) = "cuentaCode");

CREATE OR REPLACE FUNCTION trg_accountingline_validate_subcuenta_active()
RETURNS trigger AS $$
DECLARE
  v_active boolean;
BEGIN
  IF NEW."pucSubCode" IS NOT NULL THEN
    SELECT "active" INTO v_active
    FROM "PucSubcuenta"
    WHERE "code" = NEW."pucSubCode";

    IF v_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'PUC subcuenta % is not active', NEW."pucSubCode";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tg_accountingline_validate_subcuenta_active"
BEFORE INSERT OR UPDATE ON "AccountingLine"
FOR EACH ROW
EXECUTE FUNCTION trg_accountingline_validate_subcuenta_active();

CREATE OR REPLACE VIEW "v_puc_subcuenta_lookup" AS
SELECT
  sc."code" AS "subcuentaCode",
  sc."name" AS "subcuentaName",
  sc."active",

  c."code"  AS "cuentaCode",
  c."name"  AS "cuentaName",

  g."code"  AS "grupoCode",
  g."name"  AS "grupoName",

  cl."code" AS "claseCode",
  cl."name" AS "claseName",

  (cl."name" || ' > ' || g."name" || ' > ' || c."name" || ' > ' || sc."name") AS "breadcrumbs"

FROM "PucSubcuenta" sc
JOIN "PucCuenta" c ON c."code" = sc."cuentaCode"
JOIN "PucGrupo" g ON g."code" = c."grupoCode"
JOIN "PucClase" cl ON cl."code" = g."claseCode";