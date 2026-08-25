import type { TaxPreviewResponse } from "./api";

const REQUIRED_TOTALS = [
  "subtotal",
  "vatTotal",
  "impoconsumoTotal",
  "reteFuenteTotal",
  "reteIvaTotal",
  "reteIcaTotal",
  "autoRetencionTotal",
  "netReceived",
] as const;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Nest serializes Prisma.Decimal values as strings. Normalize only the HTTP
 * representation so the checkout renders the backend preview faithfully.
 */
export function normalizePublicTaxPreview(value: unknown): TaxPreviewResponse | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const normalizedTotals: Record<string, number> = {};
  for (const key of REQUIRED_TOTALS) {
    const numericValue = asFiniteNumber(record[key]);
    if (numericValue === null) return null;
    normalizedTotals[key] = numericValue;
  }

  return {
    ...record,
    ...normalizedTotals,
  } as TaxPreviewResponse;
}
