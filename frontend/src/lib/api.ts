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

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "include",
  });

  const raw = await res.text();
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
      removeToken();

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }

      throw new AppApiError({
        status: 401,
        message: "Sesion expirada",
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
