ALTER TABLE "PayrollEvent"
  ADD COLUMN "employeeContractId" TEXT;

ALTER TABLE "PayrollEvent"
  ADD CONSTRAINT "PayrollEvent_employeeContractId_fkey"
  FOREIGN KEY ("employeeContractId")
  REFERENCES "EmployeeContract"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
