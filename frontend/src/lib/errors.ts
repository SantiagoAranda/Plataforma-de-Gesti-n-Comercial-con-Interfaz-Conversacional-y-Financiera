import { AppApiError } from "@/src/lib/api";

export function getErrorMessage(error: unknown, fallback = "Ocurrió un error") {
  if (!error) return fallback;
  if (error instanceof AppApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

