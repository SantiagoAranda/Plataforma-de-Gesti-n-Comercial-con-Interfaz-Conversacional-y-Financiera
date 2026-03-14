import { getToken, removeToken } from "./auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiError = { status: number; message: string; details?: any };

async function parseError(res: Response): Promise<ApiError> {
  let details: any = null;
  try {
    details = await res.json();
  } catch {}

  return {
    status: res.status,
    message: details?.message || res.statusText || "Request failed",
    details,
  };
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, ...init } = options;

  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "include",
  });

  // 🔥 Si el token expiró o es inválido
  if (res.status === 401) {
    removeToken();

    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }

    throw new Error("Sesión expirada");
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  return (await res.json()) as T;
}