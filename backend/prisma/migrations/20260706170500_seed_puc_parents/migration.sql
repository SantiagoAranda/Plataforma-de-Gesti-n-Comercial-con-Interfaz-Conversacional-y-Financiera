-- Insert PucClase parents
INSERT INTO "PucClase" ("code", "name")
VALUES
  ('5', 'Gastos'),
  ('2', 'Pasivo')
ON CONFLICT ("code") DO NOTHING;

-- Insert PucGrupo parents
INSERT INTO "PucGrupo" ("code", "name", "claseCode")
VALUES
  ('51', 'Operacionales de administración', '5'),
  ('21', 'Obligaciones financieras', '2')
ON CONFLICT ("code") DO NOTHING;

-- Insert PucCuenta parents
INSERT INTO "PucCuenta" ("code", "name", "grupoCode")
VALUES
  ('5195', 'Diversos', '51'),
  ('2195', 'Otras obligaciones', '21')
ON CONFLICT ("code") DO NOTHING;
