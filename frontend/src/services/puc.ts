// frontend/src/services/puc.ts
import { api } from "@/src/lib/api";

export type PucClase = { code: string; name: string };
export type PucGrupo = { code: string; name: string; claseCode: string };
export type PucCuenta = { code: string; name: string; grupoCode: string };
export type PucSubcuenta = { code: string; name: string; cuentaCode: string };

export async function getPucClases(): Promise<PucClase[]> {
  return api<PucClase[]>(`/accounting/puc/clases`);
}

export async function getPucGrupos(claseCode: string): Promise<PucGrupo[]> {
  return api<PucGrupo[]>(
    `/accounting/puc/grupos?clase=${encodeURIComponent(claseCode)}`
  );
}

export async function getPucCuentas(grupoCode: string): Promise<PucCuenta[]> {
  return api<PucCuenta[]>(
    `/accounting/puc/cuentas?grupo=${encodeURIComponent(grupoCode)}`
  );
}

export async function getPucSubcuentas(cuentaCode: string): Promise<PucSubcuenta[]> {
  return api<PucSubcuenta[]>(
    `/accounting/puc/subcuentas?cuenta=${encodeURIComponent(cuentaCode)}`
  );
}

// aliases (si algún componente viejo los usa)
export const listClases = getPucClases;
export const listGrupos = getPucGrupos;

export type PucSearchResult =
  | { kind: "SUBCUENTA"; code: string; name: string; parentCode?: string }
  | { kind: "CUENTA"; code: string; name: string };

export async function searchPuc(query: string): Promise<PucSearchResult[]> {
  if (!query.trim()) return [];
  return api<PucSearchResult[]>(`/accounting/puc/search?q=${encodeURIComponent(query)}`);
}
