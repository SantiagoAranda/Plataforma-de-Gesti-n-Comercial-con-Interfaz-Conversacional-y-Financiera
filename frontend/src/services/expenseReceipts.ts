import { api } from "@/src/lib/api";

export type ReceiptStatus =
  | "PROCESSING"
  | "READY_FOR_REVIEW"
  | "DRAFT"
  | "POSTED"
  | "FAILED"
  | "REJECTED";

export type ExpenseAccountingType = "EXPENSE" | "COST";
export type ExpenseCategory =
  | "SERVICES"
  | "RENT"
  | "MARKETING"
  | "PROFESSIONAL_FEES"
  | "FOOD"
  | "TRANSPORT"
  | "MAINTENANCE"
  | "OTHER";

export type ExpenseReceipt = {
  id: string;
  status: ReceiptStatus;
  source: "OCR" | "MANUAL" | "EDITED";
  bankName?: string | null;
  reference?: string | null;
  destinationName?: string | null;
  destinationBank?: string | null;
  destinationAccount?: string | null;
  amount?: number | null;
  paidAt?: string | null;
  description?: string | null;
  confidence?: number | null;
  processingError?: string | null;
  duplicateWarning?: string | null;
  accountingType?: ExpenseAccountingType | null;
  category?: ExpenseCategory | null;
  pucCuentaCode?: string | null;
  pucSubcuentaId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseReceiptPayload = Partial<{
  amount: number;
  paidAt: string;
  destinationName: string | null;
  destinationBank: string | null;
  destinationAccount: string | null;
  bankName: string | null;
  reference: string | null;
  description: string | null;
  accountingType: ExpenseAccountingType;
  category: ExpenseCategory;
  pucCuentaCode: string | null;
  pucSubcuentaId: string | null;
}>;

export async function scanExpenseReceipt(file: File) {
  const form = new FormData();
  form.set("file", file);
  return api<{ id: string; status: ReceiptStatus }>("/expense-receipts/scan", {
    method: "POST",
    body: form,
  });
}

export async function createManualExpenseReceipt(payload: ExpenseReceiptPayload) {
  return api<ExpenseReceipt>("/expense-receipts/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getExpenseReceipt(id: string) {
  return api<ExpenseReceipt>(`/expense-receipts/${id}`);
}

export async function updateExpenseReceipt(id: string, payload: ExpenseReceiptPayload) {
  return api<ExpenseReceipt>(`/expense-receipts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function postExpenseReceipt(id: string) {
  return api<ExpenseReceipt>(`/expense-receipts/${id}/post`, {
    method: "POST",
  });
}

export async function rejectExpenseReceipt(id: string) {
  return api<ExpenseReceipt>(`/expense-receipts/${id}/reject`, {
    method: "POST",
  });
}
