import { getToken, removeToken } from "./auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class AppApiError extends Error {
  status: number;
  details?: any;
  raw: string;

  constructor({ status, message, details, raw }: { status: number; message: string; details?: any; raw: string }) {
    super(message);
    this.name = "AppApiError";
    this.status = status;
    this.details = details;
    this.raw = raw;
  }
}

async function parseError(res: Response): Promise<AppApiError> {
  const raw = await res.text();
  let details: any = null;
  let message = res.statusText || `HTTP Error ${res.status}`;

  try {
    if (raw) {
      details = JSON.parse(raw);
      if (details?.message) {
        message = Array.isArray(details.message) ? details.message.join(" | ") : details.message;
      }
    }
  } catch {}

  return new AppApiError({
    status: res.status,
    message,
    details,
    raw,
  });
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
    // 👉 SOLO si la request requería auth
    if (auth) {
      removeToken();

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }

      throw new AppApiError({
        status: 401,
        message: "Sesión expirada",
        raw: "",
      });
    }

    // 👉 login/register → NO redirigir
    throw await parseError(res);
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  return (await res.json()) as T;
}