import { getBusinessDayKey } from "@/src/lib/businessDate";

/** REGISTRO = when the sale was recorded (createdAt); TURNO = when the service takes place. */
export type SaleDateBasis = "REGISTRO" | "TURNO";

/**
 * Business-day key (YYYY-MM-DD, America/Bogota) of a sale for the chosen basis.
 * scheduledAt already comes as business-local "YYYY-MM-DDTHH:mm:ss", so its date part is the day.
 */
export function saleDayKey(
  sale: { createdAt: string; scheduledAt?: string | null },
  basis: SaleDateBasis,
): string | null {
  if (basis === "TURNO") {
    return /^\d{4}-\d{2}-\d{2}/.exec(sale.scheduledAt ?? "")?.[0] ?? null;
  }
  try {
    return getBusinessDayKey(sale.createdAt);
  } catch {
    return null;
  }
}
