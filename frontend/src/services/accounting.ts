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
  priceMin?: number;
  priceMax?: number;
};

export type BackendMovement = AccountingMovement; // compatibilidad con utilidades existentes

export type AccountingSummary = {
  balanceTotal: number;
  eficiencia: number;
  operacionComercial: {
    ventasNetas: number;
    costosMercancia: number;
    utilidadBruta: number;
    devoluciones: number;
  };
  gastosAdministrativos: {
    nominaSueldos: number;
    insumosOperativos: number;
    serviciosFijos: number;
  };
  impuestosReservas: {
    iva: number;
    retenciones: number;
    fondosReserva: number;
  };
};

export type ManualPaidOutflowType = "EXPENSE" | "COST";
export type ManualPaidOutflowPaymentMethod = "CASH" | "TRANSFER";

export type ManualPaidOutflowCategory = {
  id: string;
  code: string;
  name: string;
  parentName?: string | null;
  isSelectable?: boolean;
  pucCode: string;
  pucName: string;
  pucKind: "CUENTA" | "SUBCUENTA";
  type: ManualPaidOutflowType;
  group: { code: string; name: string };
  clase: { code: string; name: string };
};

export type ExpenseGroup = {
  id: string;
  label: string;
  icon: string;
  description: string;
  pucPrefix: string;
};

export type CreateManualPaidOutflowDto = {
  counterpartyName: string;
  amount: number;
  description: string;
  paymentMethod: ManualPaidOutflowPaymentMethod;
  type: ManualPaidOutflowType;
  categoryId: string;
};

export async function listMovements(filters: AccountingMovementsFilters = {}) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.pucSubcuentaId) qs.set("pucSubcuentaId", filters.pucSubcuentaId);
  if (filters.originType) qs.set("originType", filters.originType);
  if (filters.search) qs.set("search", filters.search);
  if (filters.priceMin !== undefined) qs.set("priceMin", filters.priceMin.toString());
  if (filters.priceMax !== undefined) qs.set("priceMax", filters.priceMax.toString());

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AccountingMovement[]>(`/accounting/movements${suffix}`);
}

export async function getAccountingSummary(filters: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<AccountingSummary>(`/accounting/summary${suffix}`);
}

export async function listManualPaidOutflowCategories(
  type: ManualPaidOutflowType,
  search?: string,
) {
  const qs = new URLSearchParams({ type });
  if (search?.trim()) qs.set("q", search.trim());

  return api<ManualPaidOutflowCategory[]>(
    `/accounting/manual-paid-outflows/categories?${qs.toString()}`,
  );
}

export async function createManualPaidOutflow(
  payload: CreateManualPaidOutflowDto,
) {
  return api<{ ok: true; originId: string; movements: AccountingMovement[] }>(
    `/accounting/manual-paid-outflows`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listExpenseGroups() {
  return api<ExpenseGroup[]>(`/accounting/expense-groups`);
}

export async function listExpenseGroupAccounts(groupId: string, search?: string) {
  const qs = new URLSearchParams();
  if (search?.trim()) qs.set("q", search.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return api<ManualPaidOutflowCategory[]>(
    `/accounting/expense-groups/${encodeURIComponent(groupId)}/accounts${suffix}`,
  );
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
