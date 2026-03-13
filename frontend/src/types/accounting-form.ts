import type { AccountingMovementOriginType } from "@/src/services/accounting";

export type Nature = "DEBIT" | "CREDIT";

export type AccountingFormState = {
  id?: string;
  pucSubcuentaId: string;
  pucCode: string;
  pucName: string;
  amount: string;
  date: string;
  detail: string;
  nature: Nature;
};