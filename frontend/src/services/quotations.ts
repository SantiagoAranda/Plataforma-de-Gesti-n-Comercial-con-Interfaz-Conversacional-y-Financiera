import { api } from "@/src/lib/api";
import type { Quotation, QuotationAction, QuotationStatus } from "@/src/types/quotations";

export const listQuotations = (status?: QuotationStatus) =>
  api<Quotation[]>(`/quotations${status ? `?status=${status}` : ""}`);

/** send | accept | reject | cancel. Repetir la acción devuelve el estado actual. */
export const transitionQuotation = (id: string, action: QuotationAction) =>
  api<Quotation>(`/quotations/${id}/${action}`, { method: "POST" });
