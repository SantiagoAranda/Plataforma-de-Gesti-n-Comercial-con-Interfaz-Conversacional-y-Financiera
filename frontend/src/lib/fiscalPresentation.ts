import type { FiscalDocumentStatus } from "@/src/types/fiscal-documents";

export const FISCAL_STATUS_PRESENTATION: Record<FiscalDocumentStatus, {
  label: string;
  badge: string;
  dot: string;
  ticks: 1 | 2;
  tickClass: string;
}> = {
  PENDING: { label: "Pendiente", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400", ticks: 1, tickClass: "text-slate-400" },
  PROCESSING: { label: "Procesando", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500", ticks: 1, tickClass: "text-slate-400" },
  SUBMITTED_PENDING_DIAN: { label: "Pendiente DIAN", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400", ticks: 2, tickClass: "text-slate-400" },
  VALIDATED: { label: "Validada", badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500", ticks: 2, tickClass: "text-[#34b7f1]" },
  RETRYABLE_FAILURE: { label: "Error temporal", badge: "bg-amber-100 text-amber-900", dot: "bg-amber-500", ticks: 1, tickClass: "text-slate-400" },
  REJECTED: { label: "Rechazada", badge: "bg-rose-100 text-rose-800", dot: "bg-rose-500", ticks: 1, tickClass: "text-slate-400" },
  CREDITED: { label: "Anulada", badge: "bg-slate-200 text-slate-800", dot: "bg-slate-500", ticks: 2, tickClass: "text-slate-400" },
};

export function functionalFiscalError(status: FiscalDocumentStatus) {
  return status === "RETRYABLE_FAILURE"
    ? "No fue posible comunicarse temporalmente con Factus. Podés reintentar."
    : "Factus rechazó el documento. Revisá el detalle antes de continuar.";
}
