import { getToken, handleSessionExpired, removeToken } from "./auth";

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

function messageFromErrorBody(
  data: any,
  fallback: string,
) {
  if (!data?.message) return fallback;
  return Array.isArray(data.message) ? data.message.join(" | ") : data.message;
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, ...init } = options;

  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let res: Response;
  let raw: string;
  const fiscalRequest = ["/sales/tax-preview", "/settings/tax-profile", "/settings/tax-profile/toggle", "/fiscal-documents/configuration"].includes(path);
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "include",
    });
    raw = await res.text();
  } catch (cause) {
    if (!init.signal?.aborted && fiscalRequest) {
      // Static route and error kind only: never log request bodies, buyer data or tokens.
      console.error("Fiscal request failed", { method: init.method ?? "GET", path, cause: cause instanceof Error ? cause.name : "UnknownError" });
      throw Object.assign(new Error("No se pudo conectar para actualizar la información fiscal. Reintentá.", { cause }), { method: init.method ?? "GET", path });
    }
    throw cause;
  }

  if (!res.ok && fiscalRequest) {
    console.error("Fiscal request failed", { method: init.method ?? "GET", path, status: res.status });
  }
  let data: any = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (res.ok) {
        throw new AppApiError({
          status: res.status,
          message: "Respuesta invalida del servidor",
          raw,
        });
      }
    }
  }

  if (res.status === 401) {
    if (auth) {
      handleSessionExpired();

      throw new AppApiError({
        status: 401,
        message: "Tu sesión ha finalizado. Por favor, inicia sesión nuevamente.",
        raw,
      });
    }

    throw new AppApiError({
      status: res.status,
      message: messageFromErrorBody(data, res.statusText || `HTTP Error ${res.status}`),
      details: data,
      raw,
    });
  }

  if (!res.ok) {
    throw new AppApiError({
      status: res.status,
      message: messageFromErrorBody(data, res.statusText || `HTTP Error ${res.status}`),
      details: data,
      raw,
    });
  }

  return data as T;
}
