"use client";

import { X } from "lucide-react";
import type { FiscalDocument } from "@/src/types/fiscal-documents";
import { FISCAL_STATUS_PRESENTATION, functionalFiscalError } from "@/src/lib/fiscalPresentation";

export default function FiscalDocumentDetailModal({ document, onClose }: { document: FiscalDocument | null; onClose: () => void }) {
  if (!document) return null;
  const state = FISCAL_STATUS_PRESENTATION[document.status];
  const attempt = document.attempts[0];
  const isError = document.status === "RETRYABLE_FAILURE" || document.status === "LOCAL_PERSISTENCE_FAILURE" || document.status === "REJECTED";
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documento fiscal</p><h2 className="mt-1 text-lg font-bold text-slate-900">{document.factusNumber ?? document.referenceCode}</h2></div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${state.badge}`}>{state.label}</span>
        {isError && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">{functionalFiscalError(document.status)}</p>{attempt?.errorMessage && <p className="mt-2 text-xs text-amber-900">{attempt.errorMessage}</p>}<p className="mt-2 text-[11px] text-amber-700">{attempt?.httpStatus ? `HTTP ${attempt.httpStatus}` : "Sin respuesta HTTP"}{attempt?.errorCode ? ` · Código ${attempt.errorCode}` : ""}</p></div>}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">Tipo</dt><dd className="font-semibold text-slate-800">{document.type === "INVOICE" ? "Factura" : "Nota crédito"}</dd></div><div><dt className="text-slate-400">Total</dt><dd className="font-semibold text-slate-800">${Number(document.total).toLocaleString("es-CO")}</dd></div>{document.cufeOrCude && <div className="col-span-2"><dt className="text-slate-400">CUFE / CUDE</dt><dd className="mt-1 break-all font-mono text-[10px] text-slate-700">{document.cufeOrCude}</dd></div>}</dl>
      </section>
    </div>
  );
}
