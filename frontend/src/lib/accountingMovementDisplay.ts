import type { AccountingMovement } from "@/src/services/accounting";

const MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX = "manual-outflow-";
const BANK_TRANSFER_PUC_CODE = "111005";

export function getAccountingMovementDisplayName(
  movement: AccountingMovement,
) {
  const isManualPaidTransferCounterpart =
    movement.pucSubcuentaId === BANK_TRANSFER_PUC_CODE &&
    movement.originType === "MANUAL" &&
    movement.originId?.startsWith(MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX) &&
    movement.nature === "CREDIT";

  return isManualPaidTransferCounterpart ? "Bancos" : movement.pucName;
}
