-- Repara solamente el rol de pago faltante para negocios ya existentes.
-- La cuenta PUC es global en este modelo; los mappings son por negocio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Business")
    AND NOT EXISTS (SELECT 1 FROM "PucCuenta" WHERE "code" = '2505') THEN
    RAISE EXCEPTION 'Cannot add NET_PAY/DEBIT mapping: global PUC account 2505 does not exist';
  END IF;
END $$;

INSERT INTO "PayrollAccountingMapping" (
  "id",
  "businessId",
  "conceptCode",
  "conceptName",
  "accountCode",
  "accountName",
  "side",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  business."id",
  'NET_PAY',
  'Neto a pagar',
  '2505',
  'Salarios por pagar',
  'DEBIT'::"PayrollAccountingSide",
  true,
  NOW(),
  NOW()
FROM "Business" AS business
WHERE NOT EXISTS (
  SELECT 1
  FROM "PayrollAccountingMapping" AS mapping
  WHERE mapping."businessId" = business."id"
    AND mapping."conceptCode" = 'NET_PAY'
    AND mapping."side" = 'DEBIT'::"PayrollAccountingSide"
);
