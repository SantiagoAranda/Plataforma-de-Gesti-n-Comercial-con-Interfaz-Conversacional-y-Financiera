-- Legal payroll effective dates and normalized overtime rates.
-- The DML is intentionally idempotent. This migration never updates payroll runs,
-- settlements, payments, accounting movements, or their historical snapshots.

DO $$
BEGIN
  CREATE TYPE "PayrollOvertimeCalculationMode" AS ENUM (
    'SURCHARGE_ONLY',
    'FULL_HOUR_FACTOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PayrollGlobalParameter"
  ADD COLUMN IF NOT EXISTS "legalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PayrollGlobalParameter"
    WHERE "year" = 2026
      AND "version" IN (2, 3)
      AND "legalCode" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot install Colombia 2026 payroll validities: version 2 or 3 already exists without a legal key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PayrollGlobalParameter"
    WHERE "year" = 2026
      AND "version" = 1
      AND "legalCode" IS NULL
      AND ("weeklyHours" <> 44 OR "monthlyHours" <> 220)
  ) THEN
    RAISE EXCEPTION
      'Cannot backfill Colombia 2026 v1: expected the existing 44/220 legal configuration';
  END IF;
END $$;

UPDATE "PayrollGlobalParameter"
SET
  "legalCode" = 'CO-PAYROLL-' || "year"::text || '-V' || "version"::text,
  "effectiveFrom" = make_date("year", 1, 1)::timestamp,
  "effectiveTo" = make_date("year" + 1, 1, 1)::timestamp
WHERE "legalCode" IS NULL
   OR "effectiveFrom" IS NULL;

UPDATE "PayrollGlobalParameter"
SET
  "legalCode" = 'CO-PAYROLL-2026-V1',
  "effectiveFrom" = TIMESTAMP '2026-01-01 00:00:00',
  "effectiveTo" = TIMESTAMP '2026-07-01 00:00:00',
  "weeklyHours" = 44,
  "monthlyHours" = 220
WHERE "year" = 2026 AND "version" = 1;

-- Clone the annual parameters from the recognized 2026 v1 record. On a fresh
-- database there is no source record and the seed will initialize all versions.
INSERT INTO "PayrollGlobalParameter" (
  "id", "legalCode", "year", "version", "isActive",
  "effectiveFrom", "effectiveTo",
  "smmlv", "transportAllowance", "uvt", "weeklyHours", "monthlyHours",
  "healthEmployeeRate", "pensionEmployeeRate",
  "healthEmployerRate", "pensionEmployerRate",
  "compensationFundRate", "senaRate", "icbfRate",
  "severanceRate", "severanceInterestRate", "serviceBonusRate", "vacationRate",
  "law1819ThresholdSmmlv", "transportLimitSmmlv",
  "dailyHours", "maxWorkedDaysMonth", "maxSupplementaryHours",
  "withholdingStatus", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, 'CO-PAYROLL-2026-V2', 2026, 2, true,
  TIMESTAMP '2026-07-01 00:00:00', TIMESTAMP '2026-07-15 00:00:00',
  p."smmlv", p."transportAllowance", p."uvt", 44, 220,
  p."healthEmployeeRate", p."pensionEmployeeRate",
  p."healthEmployerRate", p."pensionEmployerRate",
  p."compensationFundRate", p."senaRate", p."icbfRate",
  p."severanceRate", p."severanceInterestRate", p."serviceBonusRate", p."vacationRate",
  p."law1819ThresholdSmmlv", p."transportLimitSmmlv",
  p."dailyHours", p."maxWorkedDaysMonth", p."maxSupplementaryHours",
  p."withholdingStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PayrollGlobalParameter" p
WHERE p."year" = 2026 AND p."version" = 1
ON CONFLICT ("year", "version") DO NOTHING;

INSERT INTO "PayrollGlobalParameter" (
  "id", "legalCode", "year", "version", "isActive",
  "effectiveFrom", "effectiveTo",
  "smmlv", "transportAllowance", "uvt", "weeklyHours", "monthlyHours",
  "healthEmployeeRate", "pensionEmployeeRate",
  "healthEmployerRate", "pensionEmployerRate",
  "compensationFundRate", "senaRate", "icbfRate",
  "severanceRate", "severanceInterestRate", "serviceBonusRate", "vacationRate",
  "law1819ThresholdSmmlv", "transportLimitSmmlv",
  "dailyHours", "maxWorkedDaysMonth", "maxSupplementaryHours",
  "withholdingStatus", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, 'CO-PAYROLL-2026-V3', 2026, 3, true,
  TIMESTAMP '2026-07-15 00:00:00', NULL,
  p."smmlv", p."transportAllowance", p."uvt", 42, 210,
  p."healthEmployeeRate", p."pensionEmployeeRate",
  p."healthEmployerRate", p."pensionEmployerRate",
  p."compensationFundRate", p."senaRate", p."icbfRate",
  p."severanceRate", p."severanceInterestRate", p."serviceBonusRate", p."vacationRate",
  p."law1819ThresholdSmmlv", p."transportLimitSmmlv",
  p."dailyHours", p."maxWorkedDaysMonth", p."maxSupplementaryHours",
  p."withholdingStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PayrollGlobalParameter" p
WHERE p."year" = 2026 AND p."version" = 1
ON CONFLICT ("year", "version") DO NOTHING;

UPDATE "PayrollGlobalParameter"
SET
  "legalCode" = CASE "version"
    WHEN 2 THEN 'CO-PAYROLL-2026-V2'
    WHEN 3 THEN 'CO-PAYROLL-2026-V3'
  END,
  "effectiveFrom" = CASE "version"
    WHEN 2 THEN TIMESTAMP '2026-07-01 00:00:00'
    WHEN 3 THEN TIMESTAMP '2026-07-15 00:00:00'
  END,
  "effectiveTo" = CASE "version"
    WHEN 2 THEN TIMESTAMP '2026-07-15 00:00:00'
    WHEN 3 THEN NULL
  END,
  "weeklyHours" = CASE "version" WHEN 2 THEN 44 WHEN 3 THEN 42 END,
  "monthlyHours" = CASE "version" WHEN 2 THEN 220 WHEN 3 THEN 210 END
WHERE "year" = 2026 AND "version" IN (2, 3);

DO $$
BEGIN
  IF EXISTS (
    SELECT "legalCode"
    FROM "PayrollGlobalParameter"
    GROUP BY "legalCode"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate payroll legalCode values prevent safe migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "PayrollGlobalParameter_legalCode_key"
  ON "PayrollGlobalParameter"("legalCode");
CREATE INDEX IF NOT EXISTS
  "PayrollGlobalParameter_isActive_effectiveFrom_idx"
  ON "PayrollGlobalParameter"("isActive", "effectiveFrom");
CREATE INDEX IF NOT EXISTS
  "PayrollGlobalParameter_isActive_effectiveTo_idx"
  ON "PayrollGlobalParameter"("isActive", "effectiveTo");

ALTER TABLE "PayrollGlobalParameter"
  ALTER COLUMN "legalCode" SET NOT NULL,
  ALTER COLUMN "effectiveFrom" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayrollGlobalParameter_effective_range_check'
  ) THEN
    ALTER TABLE "PayrollGlobalParameter"
      ADD CONSTRAINT "PayrollGlobalParameter_effective_range_check"
      CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayrollGlobalParameter_active_effective_range_excl'
  ) THEN
    ALTER TABLE "PayrollGlobalParameter"
      ADD CONSTRAINT "PayrollGlobalParameter_active_effective_range_excl"
      EXCLUDE USING gist (
        tsrange(
          "effectiveFrom",
          COALESCE("effectiveTo", 'infinity'::timestamp),
          '[)'
        ) WITH &&
      )
      WHERE ("isActive");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'PayrollOvertimeRate'
      AND column_name = 'factor'
  ) THEN
    ALTER TABLE "PayrollOvertimeRate" RENAME COLUMN "factor" TO "totalFactor";
  END IF;
END $$;

ALTER TABLE "PayrollOvertimeRate"
  ADD COLUMN IF NOT EXISTS "legalPercentage" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "payableMultiplier" DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "calculationMode" "PayrollOvertimeCalculationMode";

UPDATE "PayrollOvertimeRate"
SET
  "legalPercentage" = ("totalFactor" - 1) * 100,
  "payableMultiplier" = CASE
    WHEN "code" IN (
      'HORA_ORDINARIA_NOCTURNA',
      'HORA_DOMINICAL_FESTIVO',
      'HORA_DOM_FESTIVO_NOCTURNO'
    ) THEN "totalFactor" - 1
    ELSE "totalFactor"
  END,
  "calculationMode" = CASE
    WHEN "code" IN (
      'HORA_ORDINARIA_NOCTURNA',
      'HORA_DOMINICAL_FESTIVO',
      'HORA_DOM_FESTIVO_NOCTURNO'
    ) THEN 'SURCHARGE_ONLY'::"PayrollOvertimeCalculationMode"
    ELSE 'FULL_HOUR_FACTOR'::"PayrollOvertimeCalculationMode"
  END
WHERE "legalPercentage" IS NULL
   OR "payableMultiplier" IS NULL
   OR "calculationMode" IS NULL;

-- Upsert the seven authoritative rates for each expected 2026 validity.
WITH legal_rates(
  version, code, name, legal_percentage, total_factor,
  payable_multiplier, calculation_mode
) AS (
  VALUES
    (1, 'HORA_ORDINARIA_NOCTURNA', 'Hora Ordinaria Nocturna', 35, 1.35, 0.35, 'SURCHARGE_ONLY'),
    (1, 'HORA_EXTRA_DIURNA', 'Hora Extra Diurna', 25, 1.25, 1.25, 'FULL_HOUR_FACTOR'),
    (1, 'HORA_EXTRA_NOCTURNO', 'Hora Extra Nocturno', 75, 1.75, 1.75, 'FULL_HOUR_FACTOR'),
    (1, 'HORA_DOMINICAL_FESTIVO', 'Hora Dominical/Festivo', 80, 1.80, 0.80, 'SURCHARGE_ONLY'),
    (1, 'HORA_EXTRA_DOM_FESTIVO', 'Hora Extra Dom/Festivo', 105, 2.05, 2.05, 'FULL_HOUR_FACTOR'),
    (1, 'HORA_DOM_FESTIVO_NOCTURNO', 'Hora Dom/Festivo Nocturno', 115, 2.15, 1.15, 'SURCHARGE_ONLY'),
    (1, 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO', 'Hora Extra Nocturno Dom/Festivo', 155, 2.55, 2.55, 'FULL_HOUR_FACTOR'),
    (2, 'HORA_ORDINARIA_NOCTURNA', 'Hora Ordinaria Nocturna', 35, 1.35, 0.35, 'SURCHARGE_ONLY'),
    (2, 'HORA_EXTRA_DIURNA', 'Hora Extra Diurna', 25, 1.25, 1.25, 'FULL_HOUR_FACTOR'),
    (2, 'HORA_EXTRA_NOCTURNO', 'Hora Extra Nocturno', 75, 1.75, 1.75, 'FULL_HOUR_FACTOR'),
    (2, 'HORA_DOMINICAL_FESTIVO', 'Hora Dominical/Festivo', 90, 1.90, 0.90, 'SURCHARGE_ONLY'),
    (2, 'HORA_EXTRA_DOM_FESTIVO', 'Hora Extra Dom/Festivo', 115, 2.15, 2.15, 'FULL_HOUR_FACTOR'),
    (2, 'HORA_DOM_FESTIVO_NOCTURNO', 'Hora Dom/Festivo Nocturno', 125, 2.25, 1.25, 'SURCHARGE_ONLY'),
    (2, 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO', 'Hora Extra Nocturno Dom/Festivo', 165, 2.65, 2.65, 'FULL_HOUR_FACTOR'),
    (3, 'HORA_ORDINARIA_NOCTURNA', 'Hora Ordinaria Nocturna', 35, 1.35, 0.35, 'SURCHARGE_ONLY'),
    (3, 'HORA_EXTRA_DIURNA', 'Hora Extra Diurna', 25, 1.25, 1.25, 'FULL_HOUR_FACTOR'),
    (3, 'HORA_EXTRA_NOCTURNO', 'Hora Extra Nocturno', 75, 1.75, 1.75, 'FULL_HOUR_FACTOR'),
    (3, 'HORA_DOMINICAL_FESTIVO', 'Hora Dominical/Festivo', 90, 1.90, 0.90, 'SURCHARGE_ONLY'),
    (3, 'HORA_EXTRA_DOM_FESTIVO', 'Hora Extra Dom/Festivo', 115, 2.15, 2.15, 'FULL_HOUR_FACTOR'),
    (3, 'HORA_DOM_FESTIVO_NOCTURNO', 'Hora Dom/Festivo Nocturno', 125, 2.25, 1.25, 'SURCHARGE_ONLY'),
    (3, 'HORA_EXTRA_NOCTURNO_DOM_FESTIVO', 'Hora Extra Nocturno Dom/Festivo', 165, 2.65, 2.65, 'FULL_HOUR_FACTOR')
)
INSERT INTO "PayrollOvertimeRate" (
  "id", "globalParameterId", "code", "name", "legalPercentage",
  "totalFactor", "payableMultiplier", "calculationMode", "isActive"
)
SELECT
  gen_random_uuid()::text, p."id", r.code, r.name, r.legal_percentage,
  r.total_factor, r.payable_multiplier,
  r.calculation_mode::"PayrollOvertimeCalculationMode", true
FROM legal_rates r
JOIN "PayrollGlobalParameter" p
  ON p."year" = 2026 AND p."version" = r.version
ON CONFLICT ("globalParameterId", "code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "legalPercentage" = EXCLUDED."legalPercentage",
  "totalFactor" = EXCLUDED."totalFactor",
  "payableMultiplier" = EXCLUDED."payableMultiplier",
  "calculationMode" = EXCLUDED."calculationMode",
  "isActive" = true;

ALTER TABLE "PayrollOvertimeRate"
  ALTER COLUMN "legalPercentage" SET NOT NULL,
  ALTER COLUMN "payableMultiplier" SET NOT NULL,
  ALTER COLUMN "calculationMode" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PayrollOvertimeRate_values_check'
  ) THEN
    ALTER TABLE "PayrollOvertimeRate"
      ADD CONSTRAINT "PayrollOvertimeRate_values_check"
      CHECK (
        "legalPercentage" >= 0
        AND "totalFactor" > 0
        AND "payableMultiplier" >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PayrollSolidarityBracket"
    GROUP BY "globalParameterId", "fromSmmlv"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate solidarity brackets prevent safe idempotent copy';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "PayrollSolidarityBracket_globalParameterId_fromSmmlv_key"
  ON "PayrollSolidarityBracket"("globalParameterId", "fromSmmlv");

INSERT INTO "PayrollSolidarityBracket" (
  "id", "globalParameterId", "fromSmmlv", "toSmmlv", "rate"
)
SELECT
  gen_random_uuid()::text, target."id", source."fromSmmlv", source."toSmmlv", source."rate"
FROM "PayrollSolidarityBracket" source
JOIN "PayrollGlobalParameter" base
  ON base."id" = source."globalParameterId"
JOIN "PayrollGlobalParameter" target
  ON target."year" = 2026 AND target."version" IN (2, 3)
WHERE base."year" = 2026 AND base."version" = 1
ON CONFLICT ("globalParameterId", "fromSmmlv") DO NOTHING;
