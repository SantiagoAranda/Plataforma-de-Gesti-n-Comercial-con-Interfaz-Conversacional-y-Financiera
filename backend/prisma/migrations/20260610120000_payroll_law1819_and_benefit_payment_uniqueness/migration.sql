CREATE TYPE "LegalPersonType" AS ENUM ('LEGAL_ENTITY', 'NATURAL_PERSON');

ALTER TABLE "PayrollBusinessParameter"
ADD COLUMN "isIncomeTaxFiler" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "legalPersonType" "LegalPersonType" NOT NULL DEFAULT 'LEGAL_ENTITY',
ADD COLUMN "employeeCountForExemption" INTEGER;

CREATE UNIQUE INDEX "PayrollBenefitPayment_contractId_type_year_semester_key"
ON "PayrollBenefitPayment"("contractId", "type", "year", "semester");
