import type { AccountingMovement } from "@/src/services/accounting";

const MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX = "manual-outflow-";
const BANK_TRANSFER_PUC_CODE = "111005";
const CASH_PUC_CODE = "110505";

const FRIENDLY_PUC_NAMES: Record<string, string> = {
  "519560": "Comida / Alimentación",
  "529560": "Comida / Alimentación",
  "511095": "Honorarios",
  "521095": "Honorarios",
  "512095": "Alquiler / Arrendamientos",
  "522095": "Alquiler / Arrendamientos",
};

export function getAccountingMovementDisplayName(
  movement: AccountingMovement,
) {
  const isManualOutflow =
    movement.originType === "MANUAL" &&
    movement.originId?.startsWith(MANUAL_PAID_OUTFLOW_ORIGIN_PREFIX);

  if (isManualOutflow && movement.nature === "CREDIT") {
    if (movement.pucSubcuentaId === BANK_TRANSFER_PUC_CODE) {
      return "Moneda nacional (Bancos)";
    }
    if (movement.pucSubcuentaId === CASH_PUC_CODE) {
      return "Caja general";
    }
  }

  const pucCode = (movement.pucSubcuentaId || movement.pucCuentaCode || movement.pucCode || "").trim();
  if (pucCode && FRIENDLY_PUC_NAMES[pucCode]) {
    return FRIENDLY_PUC_NAMES[pucCode];
  }

  return movement.pucName || "Movimiento contable";
}
