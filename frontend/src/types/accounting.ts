import { api } from "@/src/lib/api";

export type MovementNature = "DEBIT" | "CREDIT";

// frontend/src/types/accounting.ts
export type AccountingType = "ALL" | "INCOME" | "EXPENSE" | "ASSET";

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
    class: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "MEMO" | "CONTROL" | "UNKNOWN";
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

export async function updateEntry(entryId: string, dto: {
    date?: string;
    memo?: string;
    lines?: Array<{
        pucCuentaCode?: string;
        pucSubCode?: string;
        description?: string;
        debit: number;
        credit: number;
    }>;
}) {
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
    // back: GET /accounting/puc/:code -> { kind: 'SUBCUENTA'|'CUENTA', ... }
    return api<{ kind: "SUBCUENTA" | "CUENTA"; code: string; name: string }>(`/accounting/puc/${code}`);
}

export async function searchPuc(q: string) {
    return api<Array<{ kind: "SUBCUENTA" | "CUENTA"; code: string; name: string }>>(
        `/accounting/puc/search?q=${encodeURIComponent(q)}`
    );
}