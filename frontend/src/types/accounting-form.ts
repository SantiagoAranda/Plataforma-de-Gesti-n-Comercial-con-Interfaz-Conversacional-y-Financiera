import type { AccountingMovementOriginType } from "@/src/services/accounting";

export type Nature = "DEBIT" | "CREDIT";
export type SelectedPuc =
  | {
      level: "account";
      id: string;
      code: string;
      name: string;
    }
  | {
      level: "subaccount";
      id: string;
      code: string;
      name: string;
    };

export type AccountingFormState = {
  id?: string;
  originType: AccountingMovementOriginType;
  originId?: string | null;
  selectedPuc: SelectedPuc | null;
  pucCuentaCode: string;
  pucSubcuentaId: string;
  pucKind: "CUENTA" | "SUBCUENTA";
  pucCode: string;
  pucName: string;
  amount: string;
  date: string;
  detail: string;
  nature: Nature;
};
