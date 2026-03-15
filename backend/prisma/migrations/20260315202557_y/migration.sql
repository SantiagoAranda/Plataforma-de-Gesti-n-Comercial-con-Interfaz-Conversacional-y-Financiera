-- DropForeignKey
ALTER TABLE "AccountingMovement" DROP CONSTRAINT "AccountingMovement_pucCuentaCode_fkey";

-- DropForeignKey
ALTER TABLE "AccountingMovement" DROP CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey";

-- AddForeignKey
ALTER TABLE "AccountingMovement" ADD CONSTRAINT "AccountingMovement_pucCuentaCode_fkey" FOREIGN KEY ("pucCuentaCode") REFERENCES "PucCuenta"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMovement" ADD CONSTRAINT "AccountingMovement_pucSubcuentaId_fkey" FOREIGN KEY ("pucSubcuentaId") REFERENCES "PucSubcuenta"("code") ON DELETE SET NULL ON UPDATE CASCADE;
