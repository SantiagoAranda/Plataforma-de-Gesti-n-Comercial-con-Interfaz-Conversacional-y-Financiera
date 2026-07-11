INSERT INTO "PucSubcuenta" ("code", "name", "cuentaCode", "active")
VALUES
  ('519595', 'Otro - Gasto Impuesto régimen simple', '5195', true),
  ('219595', 'Otro - Impuesto simple por pagar', '2195', true)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "cuentaCode" = EXCLUDED."cuentaCode",
  "active" = true;
