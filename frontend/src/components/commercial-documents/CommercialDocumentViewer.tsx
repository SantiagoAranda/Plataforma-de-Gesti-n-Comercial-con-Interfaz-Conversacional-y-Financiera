"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import CartaDocument from "./CartaDocument";
import { buildPdfBlob, downloadBlob, shareOrDownload } from "./buildPdf";
import { deliveryOrderSpec, quotationSpec, TicketDocument } from "./documents";
import type { CommercialDocumentData, DocumentFormat, DocumentKind, TicketWidth } from "./types";

const WIDTH_KEY = "sactec_ticket_w";
const CARTA_W = 816;
const SHEET_W: Record<TicketWidth, number> = { 58: 219, 80: 302 };

const seg = (on: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`;

export default function CommercialDocumentViewer({
  kind,
  data,
  className,
}: {
  kind: DocumentKind;
  data: CommercialDocumentData;
  className?: string;
}) {
  const [format, setFormat] = useState<DocumentFormat>("carta");
  const [width, setWidth] = useState<TicketWidth>(80);
  const [showPrices, setShowPrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [innerH, setInnerH] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pdfCache = useRef<{ key: string; promise: Promise<Blob> } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(WIDTH_KEY) === "58") setWidth(58);
    } catch {}
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const ro = new ResizeObserver(() => {
      setBoxW(box.clientWidth);
      setInnerH(inner.offsetHeight);
    });
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [format, width]);

  const spec = useMemo(
    () => (kind === "quotation" ? quotationSpec(data) : deliveryOrderSpec(data, showPrices)),
    [kind, data, showPrices],
  );

  const sheetW = format === "carta" ? CARTA_W : SHEET_W[width];
  const scale = boxW ? Math.min(1, (boxW - 24) / sheetW) : 1;
  const key = [kind, format, width, showPrices, data.number].join("|");
  const filename = `${data.number}${format === "ticket" ? `-ticket${width}` : ""}.pdf`;

  const getPdf = () => {
    if (pdfCache.current?.key !== key) {
      const entry = { key, promise: buildPdfBlob(innerRef.current as HTMLElement, format, width) };
      entry.promise.catch(() => {
        if (pdfCache.current === entry) pdfCache.current = null;
      });
      pdfCache.current = entry;
    }
    return pdfCache.current.promise;
  };

  // Se genera con antelación: compartir exige que el gesto del usuario siga vigente.
  useEffect(() => {
    const t = setTimeout(() => getPdf().catch(() => {}), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const run = async (action: (blob: Blob) => Promise<void> | void) => {
    setBusy(true);
    try {
      await action(await getPdf());
    } catch {
      toast.error("No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  };

  const changeWidth = (w: TicketWidth) => {
    setWidth(w);
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {}
  };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-slate-100 p-1">
          <button type="button" className={seg(format === "carta")} onClick={() => setFormat("carta")}>Carta</button>
          <button type="button" className={seg(format === "ticket")} onClick={() => setFormat("ticket")}>Ticket</button>
        </div>
        {format === "ticket" && (
          <div className="flex rounded-full bg-slate-100 p-1">
            <button type="button" className={seg(width === 80)} onClick={() => changeWidth(80)}>80 mm</button>
            <button type="button" className={seg(width === 58)} onClick={() => changeWidth(58)}>58 mm</button>
          </div>
        )}
        {kind === "delivery" && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
            Mostrar precios
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" aria-label="Imprimir" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          <button type="button" aria-label="Descargar PDF" disabled={busy} onClick={() => run((b) => downloadBlob(b, filename))} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button type="button" aria-label="Compartir" disabled={busy} onClick={() => run((b) => shareOrDownload(b, filename))} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
            <Share2 className="h-3.5 w-3.5" /> Compartir
          </button>
        </div>
      </div>

      <div ref={boxRef} className="overflow-auto rounded-xl bg-slate-200 p-3">
        <div style={{ width: sheetW * scale, height: innerH * scale, margin: "0 auto" }}>
          <div ref={innerRef} className="cd-print-root" style={{ width: sheetW, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {format === "carta" ? (
              <CartaDocument spec={spec} />
            ) : (
              <TicketDocument kind={kind} d={data} width={width} showPrices={showPrices} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
