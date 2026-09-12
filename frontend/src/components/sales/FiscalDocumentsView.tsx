"use client";

import type { FiscalDocument, FiscalDocumentStatus } from "@/src/types/fiscal-documents";
import { FISCAL_STATUS_PRESENTATION } from "@/src/lib/fiscalPresentation";

export type FiscalViewFilter = "ALL" | "VALIDATED" | "PENDING" | "ERROR" | "CREDIT_NOTES" | "CREDITED";

const FILTERS: Array<{ value: FiscalViewFilter; label: string }> = [
  { value: "ALL", label: "Todas" },
  { value: "VALIDATED", label: "Validadas" },
  { value: "PENDING", label: "Pendientes" },
  { value: "ERROR", label: "Con error" },
  { value: "CREDIT_NOTES", label: "Notas crédito" },
  { value: "CREDITED", label: "Anuladas" },
];

function matches(document: FiscalDocument, filter: FiscalViewFilter) {
  if (filter === "ALL") return true;
  if (filter === "VALIDATED") return document.status === "VALIDATED";
  if (filter === "PENDING") return (["PENDING", "PROCESSING", "SUBMITTED_PENDING_DIAN"] as FiscalDocumentStatus[]).includes(document.status);
  if (filter === "ERROR") return document.status === "RETRYABLE_FAILURE" || document.status === "REJECTED";
  if (filter === "CREDIT_NOTES") return document.type === "CREDIT_NOTE";
  return document.type === "INVOICE" && document.status === "CREDITED";
}

export default function FiscalDocumentsView({ documents, filter, onFilter, onOpen, onDownload }: { documents: FiscalDocument[]; filter: FiscalViewFilter; onFilter: (filter: FiscalViewFilter) => void; onOpen: (document: FiscalDocument) => void; onDownload?: (document: FiscalDocument, kind: "pdf" | "xml") => void }) {
  const visible = documents.filter((document) => matches(document, filter));
  return (
    <section className="mx-auto w-full max-w-4xl px-3 pb-28 pt-4 sm:px-4">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => <button key={item.value} onClick={() => onFilter(item.value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === item.value ? "border-[#0B3F64] bg-[#E6EFF5] text-[#0B3F64]" : "border-slate-200 bg-white text-slate-600"}`}>{item.label}</button>)}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[100px_1fr_1fr_100px_110px_100px_100px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid"><span>Fecha</span><span>Número</span><span>Cliente</span><span>Venta</span><span>Total</span><span>Estado</span><span>Tipo</span></div>
        {visible.map((document) => {
          const state = FISCAL_STATUS_PRESENTATION[document.status];
          return <div key={document.id} role="button" tabIndex={0} onClick={() => onOpen(document)} onKeyDown={(event) => { if (event.key === "Enter") onOpen(document); }} className="grid w-full cursor-pointer gap-2 border-t border-slate-100 px-4 py-4 text-left text-xs hover:bg-slate-50 md:grid-cols-[100px_1fr_1fr_100px_110px_100px_100px] md:items-center md:gap-3"><span className="text-slate-500">{new Date(document.createdAt).toLocaleDateString("es-CO")}</span><span className="truncate font-semibold text-slate-900">{document.factusNumber ?? document.referenceCode}</span><span className="truncate text-slate-700">{document.order?.customerName ?? "Consumidor Final"}</span><span className="font-mono text-[10px] text-slate-500">{document.orderId.slice(0, 8)}</span><span className="font-semibold text-slate-900">${Number(document.total).toLocaleString("es-CO")}</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold ${state.badge}`}>{state.label}</span><span className="flex flex-wrap items-center gap-1 text-slate-600"><span>{document.type === "INVOICE" ? "Factura" : "Nota crédito"}</span>{onDownload && (["pdf", "xml"] as const).map((kind) => document.artifacts.some((artifact) => artifact.kind.toLowerCase() === kind) ? <button key={kind} type="button" onClick={(event) => { event.stopPropagation(); onDownload(document, kind); }} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#0B3F64]">{kind}</button> : null)}</span></div>;
        })}
        {!visible.length && <p className="px-4 py-10 text-center text-sm text-slate-400">No hay documentos para este filtro.</p>}
      </div>
    </section>
  );
}
