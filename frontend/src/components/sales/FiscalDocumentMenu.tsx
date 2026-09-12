"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileWarning, MoreVertical, RefreshCw, RotateCcw, Send } from "lucide-react";
import type { FiscalDocument } from "@/src/types/fiscal-documents";

type Props = {
  document: FiscalDocument;
  creditNote?: FiscalDocument;
  onView: (document: FiscalDocument) => void;
  onViewReceipt: (document: FiscalDocument) => void;
  onDownload: (document: FiscalDocument, kind: "pdf" | "xml") => void;
  onDispatch: (document: FiscalDocument) => void;
  onRetry: (document: FiscalDocument) => void;
  onAnnul: (document: FiscalDocument) => void;
  onCompleteAnnulment: (document: FiscalDocument) => void;
};

export default function FiscalDocumentMenu(props: Props) {
  const { document, creditNote } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    globalThis.document.addEventListener("mousedown", close);
    return () => globalThis.document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  const hasArtifact = (kind: "pdf" | "xml") =>
    document.artifacts.some((artifact) => artifact.kind.toLowerCase() === kind);
  const actionClass = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Opciones de facturación electrónica"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-8 z-30 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl">
          {(["PENDING", "PROCESSING", "SUBMITTED_PENDING_DIAN"] as const).includes(document.status as "PENDING" | "PROCESSING" | "SUBMITTED_PENDING_DIAN") && <button className={actionClass} onClick={() => run(() => props.onView(document))}><Eye size={14} />Ver estado</button>}
          {document.status === "PENDING" && <button className={actionClass} onClick={() => run(() => props.onDispatch(document))}><Send size={14} />Procesar ahora <span className="ml-auto text-[9px] font-normal text-slate-400">Opcional</span></button>}
          {document.status === "RETRYABLE_FAILURE" && <button className={actionClass} onClick={() => run(() => props.onRetry(document))}><RefreshCw size={14} />Reintentar</button>}
          {(document.status === "RETRYABLE_FAILURE" || document.status === "REJECTED") && <button className={actionClass} onClick={() => run(() => props.onView(document))}><FileWarning size={14} />Ver error</button>}
          {(document.status === "VALIDATED" || document.status === "CREDITED") && <button className={actionClass} onClick={() => run(() => props.onViewReceipt(document))}><Eye size={14} />{document.status === "CREDITED" ? "Ver factura original" : "Ver factura"}</button>}
          {(document.status === "VALIDATED" || document.status === "CREDITED") && <button disabled={!hasArtifact("pdf")} className={actionClass} onClick={() => run(() => props.onDownload(document, "pdf"))}><Download size={14} />Descargar PDF</button>}
          {(document.status === "VALIDATED" || document.status === "CREDITED") && <button disabled={!hasArtifact("xml")} className={actionClass} onClick={() => run(() => props.onDownload(document, "xml"))}><Download size={14} />Descargar XML</button>}
          {document.status === "VALIDATED" && !creditNote && <button className={`${actionClass} text-rose-700`} onClick={() => run(() => props.onAnnul(document))}><RotateCcw size={14} />Crear nota crédito / Anular</button>}
          {document.status === "VALIDATED" && creditNote?.status === "VALIDATED" && <button className={`${actionClass} text-rose-700`} onClick={() => run(() => props.onCompleteAnnulment(document))}><RotateCcw size={14} />Completar anulación</button>}
          {creditNote && <button className={actionClass} onClick={() => run(() => props.onView(creditNote))}><Eye size={14} />Ver nota crédito</button>}
          {document.status === "CREDITED" && creditNote?.status === "VALIDATED" && ["pdf", "xml"].map((kind) => (
            <button key={kind} disabled={!creditNote.artifacts.some((artifact) => artifact.kind.toLowerCase() === kind)} className={actionClass} onClick={() => run(() => props.onDownload(creditNote, kind as "pdf" | "xml"))}><Download size={14} />Nota crédito {kind.toUpperCase()}</button>
          ))}
        </div>
      )}
    </div>
  );
}
