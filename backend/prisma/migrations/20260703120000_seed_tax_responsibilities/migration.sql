INSERT INTO "TaxResponsibility" ("id", "code", "name", "description")
VALUES
  ('tax-responsibility-05', '05', 'Impuesto Renta', NULL),
  ('tax-responsibility-07', '07', 'Retención en la Fuente', NULL),
  ('tax-responsibility-10', '10', 'Obligado Contabilidad', NULL),
  ('tax-responsibility-13', '13', 'Gran Contribuyente', NULL),
  ('tax-responsibility-15', '15', 'Autorretenedor', NULL),
  ('tax-responsibility-47', '47', 'Régimen Simple', NULL),
  ('tax-responsibility-48', '48', 'Responsable IVA', NULL),
  ('tax-responsibility-49', '49', 'No Responsable IVA', NULL),
  ('tax-responsibility-52', '52', 'Facturador Electrónico', NULL)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";
