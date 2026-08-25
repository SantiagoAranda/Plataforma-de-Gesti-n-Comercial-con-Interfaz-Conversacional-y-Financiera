import type { AccountingMovement } from "@/src/services/accounting";

const MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX = "manual-outflow-";
const BANK_TRANSFER_PUC_CODE = "111005";
const GENERIC_RENT_PUC_CODE = "512095";

export function getAccountingMovementDisplayName(
  movement: AccountingMovement,
) {
  const isManualPaidTransferCounterpart =
    movement.pucSubcuentaId === BANK_TRANSFER_PUC_CODE &&
    movement.originType === "MANUAL" &&
    movement.originId?.startsWith(MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX) &&
    movement.nature === "CREDIT";

  if (isManualPaidTransferCounterpart) return "Bancos";

  const isManualPaidRentExpense =
    movement.pucSubcuentaId === GENERIC_RENT_PUC_CODE &&
    movement.originType === "MANUAL" &&
    movement.originId?.startsWith(MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX) &&
    movement.nature === "DEBIT";

  return isManualPaidRentExpense
    ? "Alquiler / Arrendamientos"
    : movement.pucName;
}
