"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import CommercialDocumentViewer from "./CommercialDocumentViewer";
import type { CommercialDocumentData, DocumentKind } from "./types";

const LABEL: Record<DocumentKind, string> = { quotation: "Cotización", delivery: "Orden de entrega" };

export default function DocumentModal({
  kind,
  data,
  onClose,
  footer,
}: {
  kind: DocumentKind;
  data: CommercialDocumentData;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={LABEL[kind]}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            {LABEL[kind]} <span className="font-medium text-slate-400">{data.number}</span>
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <CommercialDocumentViewer kind={kind} data={data} />
        {footer}
      </div>
    </div>
  );
}
