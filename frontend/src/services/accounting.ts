import { api } from "@/src/lib/api";

export type AccountingMovementOriginType = "MANUAL" | "ORDER";

export type AccountingMovement = {
  id: string;
  businessId: string;
  pucCuentaCode?: string | null;
  pucSubcuentaId?: string | null;
  pucCode: string;
  pucName: string;
  pucKind: "CUENTA" | "SUBCUENTA";
  amount: number;
  nature: "DEBIT" | "CREDIT";
  date: string;
  detail: string | null;
  originType: AccountingMovementOriginType;
  originId?: string | null;
  createdAt: string;
  updatedAt: string;
  // metadata opcional del PUC
  pucMeta?: {
    clase?: { code: string; name: string };
    grupo?: { code: string; name: string };
    cuenta?: { code: string; name: string };
    subcuenta?: { code: string; name: string };
  };
};

export type UpdateAccountingMovementDto = Partial<CreateAccountingMovementDto>;

export type AccountingMovementsFilters = {
  from?: string;
  to?: string;
  pucSubcuentaId?: string;
  originType?: AccountingMovementOriginType;
  search?: string;
};

export type BackendMovement = AccountingMovement; // compatibilidad con utilidades existentes

export async function listMovements(filters: AccountingMovementsFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.pucSubcuentaId) qs.set("pucSubcuentaId", filters.pucSubcuentaId);
  if (filters.originType) qs.set("originType", filters.originType);
  if (filters.search) qs.set("search", filters.search);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AccountingMovement[]>(`/accounting/movements${suffix}`);
}

export async function getMovement(id: string) {
  return api<AccountingMovement>(`/accounting/movements/${id}`);
}

export async function createMovement(payload: CreateAccountingMovementDto) {
  return api<AccountingMovement>(`/accounting/movements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMovement(id: string, payload: UpdateAccountingMovementDto) {
  return api<AccountingMovement>(`/accounting/movements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteMovement(id: string) {
  return api<{ ok: true; id: string }>(`/accounting/movements/${id}`, {
    method: "DELETE",
  });
}

export type MovementNature = "DEBIT" | "CREDIT";

export type CreateAccountingMovementDto = {
  pucCuentaCode?: string | null;
  pucSubcuentaId?: string | null;
  amount: number;
  nature: MovementNature;
  date: string;
  detail?: string | null;
  originType: "MANUAL" | "ORDER";
  originId?: string;
};
