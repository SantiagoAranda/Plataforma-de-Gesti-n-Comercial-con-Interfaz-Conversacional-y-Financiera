// frontend/src/services/puc.ts
export type PucClase = { code: string; name: string };
export type PucGrupo = { code: string; name: string; claseCode: string };

// Para el composer (si seguís con el mock local por ahora)
export type PucKind = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type PucNode = {
  code: string;
  name: string;
  kind: PucKind;
  breadcrumbs: string[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

/*function getToken() {
  // ajustá la key si usás otra
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}*/
function getToken() {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("jwt")
  );
}

async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

// --- exports que te faltan (dos nombres para que no rompas imports) ---

export async function getPucClases(): Promise<PucClase[]> {
  return apiGet<PucClase[]>("/accounting/puc/clases");
}

export async function getPucGrupos(claseCode: string): Promise<PucGrupo[]> {
  const c = encodeURIComponent(claseCode);
  return apiGet<PucGrupo[]>(`/accounting/puc/grupos?clase=${c}`);
}

// aliases (para AccountingLineSelector)
export const listClases = getPucClases;
export const listGrupos = getPucGrupos;