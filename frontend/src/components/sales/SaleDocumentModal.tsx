"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import CommercialDocumentViewer from "@/src/components/commercial-documents/CommercialDocumentViewer";
import type { DocumentKind } from "@/src/components/commercial-documents/types";
import type { BusinessLogoProfile } from "@/src/lib/businessLogo";
import { DOCUMENT_LABEL, saleToDocumentData } from "@/src/lib/sales/saleDocument";
import type { Sale } from "@/src/types/sales";

export default function SaleDocumentModal({
  sale,
  kind,
  business,
  onClose,
}: {
  sale: Sale;
  kind: DocumentKind;
  business: BusinessLogoProfile | null;
  onClose: () => void;
}) {
  const data = useMemo(() => saleToDocumentData(sale, kind, business), [sale, kind, business]);

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
        aria-label={DOCUMENT_LABEL[kind]}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            {DOCUMENT_LABEL[kind]} <span className="font-medium text-slate-400">{data.number}</span>
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <CommercialDocumentViewer kind={kind} data={data} />
      </div>
    </div>
  );
}
