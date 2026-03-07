

import { api } from "@/src/lib/api";

export type MovementNature = "DEBIT" | "CREDIT";

// frontend/src/services/accounting.ts
export type AccountingType = "ALL" | "INCOME" | "EXPENSE" | "ASSET";
export type SalesAccountingTemplateType = "PRODUCT" | "SERVICE";

export type SalesAccountingTemplate = {
  type: SalesAccountingTemplateType;

  debitCashPucCuentaCode: string | null;
  debitCashPucSubCode: string | null;

  debitReceivablePucCuentaCode: string | null;
  debitReceivablePucSubCode: string | null;

  creditIncomePucCuentaCode: string | null;
  creditIncomePucSubCode: string | null;

  creditVatPucCuentaCode: string | null;
  creditVatPucSubCode: string | null;

  debitCostPucCuentaCode: string | null;
  debitCostPucSubCode: string | null;

  creditInventoryPucCuentaCode: string | null;
  creditInventoryPucSubCode: string | null;

  vatRate: number;
  pricesIncludeVat: boolean;
};

export type UpsertSalesAccountingTemplateDto = {
  debitCashPucCuentaCode?: string;
  debitCashPucSubCode?: string;

  debitReceivablePucCuentaCode?: string;
  debitReceivablePucSubCode?: string;

  creditIncomePucCuentaCode?: string;
  creditIncomePucSubCode?: string;

  creditVatPucCuentaCode?: string;
  creditVatPucSubCode?: string;

  debitCostPucCuentaCode?: string;
  debitCostPucSubCode?: string;

  creditInventoryPucCuentaCode?: string;
  creditInventoryPucSubCode?: string;

  vatRate: number;
  pricesIncludeVat: boolean;
};

export type BackendMovement = {
  id: string; // lineId
  entryId: string;
  date: string; // ISO
  status: "DRAFT" | "POSTED" | "VOID";
  memo: string | null;
  pucCode: string;
  pucName: string | null;
  description: string | null;
  debit: number;
  credit: number;
  amountSigned: number; // debit - credit
  class:
    | "ASSET"
    | "LIABILITY"
    | "EQUITY"
    | "INCOME"
    | "EXPENSE"
    | "MEMO"
    | "CONTROL"
    | "UNKNOWN";
};

export async function listMovements(params?: {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  pucCode?: string;
  onlyPosted?: "true" | "false";
}) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.q) qs.set("q", params.q);
  if (params?.pucCode) qs.set("pucCode", params.pucCode);
  if (params?.onlyPosted) qs.set("onlyPosted", params.onlyPosted);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<BackendMovement[]>(`/accounting/movements${suffix}`);
}

/**
 * ⚠️ Endpoint legacy (una línea = un "movimiento").
 * Podés mantenerlo por compatibilidad hasta migrar toda la UI.
 */
export async function createMovement(dto: {
  date?: string;
  memo?: string;
  pucCuentaCode?: string;
  pucSubCode?: string;
  nature: MovementNature;
  amount: number;
  description?: string;
}) {
  return api<any>(`/accounting/movements`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export type AccountingEntryStatus = "DRAFT" | "POSTED" | "VOID";

export type AccountingEntryDto = {
  id: string;
  date: string;
  memo: string | null;
  status: AccountingEntryStatus;
  lines: Array<{
    id: string;
    pucCuentaCode: string | null;
    pucSubCode: string | null;
    description: string | null;
    debit: number;
    credit: number;
  }>;
};

// ✅ Tipos para crear/editar asientos multi-línea
export type CreateLineDto = {
  pucCuentaCode?: string;
  pucSubCode?: string;
  description?: string;
  debit: number;
  credit: number;
};

export type CreateEntryDto = {
  date?: string; // "YYYY-MM-DD"
  memo?: string;
  lines: CreateLineDto[];
};

/**
 * ✅ NUEVO: crear asiento DRAFT multi-línea
 * Requiere backend: POST /accounting/entries
 */
export async function createEntry(dto: CreateEntryDto) {
  return api<AccountingEntryDto>(`/accounting/entries`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function updateEntry(
  entryId: string,
  dto: {
    date?: string;
    memo?: string;
    lines?: Array<{
      pucCuentaCode?: string;
      pucSubCode?: string;
      description?: string;
      debit: number;
      credit: number;
    }>;
  },
) {
  return api<any>(`/accounting/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export async function deleteEntry(entryId: string) {
  return api<{ ok: true; id: string }>(`/accounting/entries/${entryId}`, {
    method: "DELETE",
  });
}

export async function getPuc(code: string) {
  // GET /accounting/puc/:code -> { kind: 'SUBCUENTA'|'CUENTA', ... }
  return api<{ kind: "SUBCUENTA" | "CUENTA"; code: string; name: string }>(
    `/accounting/puc/${code}`,
  );
}

export async function searchPuc(q: string) {
  return api<Array<{ kind: "SUBCUENTA" | "CUENTA"; code: string; name: string }>>(
    `/accounting/puc/search?q=${encodeURIComponent(q)}`,
  );
}

export type MovementsProgressResponse = {
  date: string;
  sections: Array<{
    key: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "OTHER";
    title: string;
    total: number;
    items: Array<{
      code: string;
      label: string;
      amount: number;
      progress: number; // 0..1
    }>;
  }>;
};

export async function getMovementsProgress(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return api<MovementsProgressResponse>(`/accounting/movements/progress${qs}`);
}

export async function getEntry(entryId: string) {
  return api<AccountingEntryDto>(`/accounting/entries/${entryId}`);
}

export async function postEntry(entryId: string) {
  return api<AccountingEntryDto>(`/accounting/entries/${entryId}/post`, {
    method: "POST",
  });
}

export async function voidEntry(entryId: string) {
  return api<AccountingEntryDto>(`/accounting/entries/${entryId}/void`, {
    method: "POST",
  });
}

// ---------------- Sales templates ----------------

export async function listSalesTemplates() {
  return api<SalesAccountingTemplate[]>(`/accounting/sales-templates`);
}

export async function getSalesTemplate(type: SalesAccountingTemplateType) {
  return api<SalesAccountingTemplate>(`/accounting/sales-templates/${type}`);
}

export async function upsertSalesTemplate(
  type: SalesAccountingTemplateType,
  dto: UpsertSalesAccountingTemplateDto,
) {
  return api<SalesAccountingTemplate>(`/accounting/sales-templates/${type}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
