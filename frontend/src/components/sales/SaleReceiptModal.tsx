"use client";

import { useRef, useState, type RefObject } from "react";
import { AlertTriangle, Download, Loader2, Printer, ReceiptText, Share2, X } from "lucide-react";
import toast from "react-hot-toast";

import type { Sale } from "@/src/types/sales";
import { readBusinessProfile } from "@/src/lib/businessProfile";
import { getStatusStyles } from "@/src/lib/statusStyles";

type BusinessReceiptProfile = {
  name: string;
  subtitle: string;
  phone: string;
  logoUrl: string;
  identification: string;
  address: string;
};

type ReceiptViewProps = {
  sale: Sale;
  receiptRef: RefObject<HTMLDivElement | null>;
  isExporting: boolean;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onShare: () => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function calcTotal(sale: Sale) {
  if (Number.isFinite(sale.total)) return sale.total;
  return sale.items.reduce((acc, it) => acc + getLineTotal(it), 0);
}

function getLineUnitPrice(item: Sale["items"][number]) {
  if (Number.isFinite(item.unitPrice)) return item.unitPrice;
  if (Number.isFinite(item.price) && item.qty > 0) return item.price / item.qty;
  return 0;
}

function getLineTotal(item: Sale["items"][number]) {
  return getLineUnitPrice(item) * item.qty;
}

function formatReceiptNumber(id: string) {
  return `VTA-${id.slice(-6).toUpperCase().padStart(6, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentMethodLabel(paymentMethod?: Sale["paymentMethod"]) {
  if (paymentMethod === "BANK_TRANSFER") return "Transferencia";
  if (paymentMethod === "CASH") return "Efectivo";
  return "Pendiente";
}

function statusBadgeClass(status: Sale["status"]) {
  if (status === "CERRADO") return "bg-emerald-50 text-emerald-700";
  if (status === "CANCELADO") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

function readReceiptBusinessProfile(): BusinessReceiptProfile {
  const profile = readBusinessProfile();

  if (typeof window === "undefined") {
    return {
      ...profile,
      logoUrl: "",
      identification: "",
      address: "",
    };
  }

  return {
    ...profile,
    logoUrl:
      localStorage.getItem("businessLogoUrl") ||
      localStorage.getItem("businessLogo") ||
      "",
    identification:
      localStorage.getItem("businessNit") ||
      localStorage.getItem("businessIdentification") ||
      "",
    address:
      localStorage.getItem("businessAddress") ||
      localStorage.getItem("businessDireccion") ||
      "",
  };
}

function copyComputedStyles(source: Element, target: Element) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

  const computed = window.getComputedStyle(source);
  Array.from(computed).forEach((property) => {
    target.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    );
  });

  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children.item(index);
    if (targetChild) copyComputedStyles(child, targetChild);
  });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SaleReceiptView({
  sale,
  receiptRef,
  isExporting,
  onClose,
  onPrint,
  onDownload,
  onShare,
}: ReceiptViewProps) {
  const business = readReceiptBusinessProfile();
  const total = calcTotal(sale);
  const subtotal = total;
  const discounts = 0;
  const taxes = 0;
  const statusStyles = getStatusStyles(sale.status);

  return (
    <article className="max-w-md mx-auto bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden">
      <div
        ref={receiptRef}
        id="sale-receipt-print-area"
        className="max-h-[86dvh] overflow-y-auto bg-white"
      >
        <header className="px-6 pb-5 pt-6 text-center">
          {business.logoUrl ? (
            <div
              className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 bg-cover bg-center"
              style={{ backgroundImage: `url(${business.logoUrl})` }}
              aria-label={business.name}
              role="img"
            />
          ) : (
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ReceiptText className="h-7 w-7" />
            </div>
          )}

          <h2 className="text-lg font-black text-slate-900">
            {business.name}
          </h2>
          {business.identification && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              NIT/ID: {business.identification}
            </p>
          )}
          {business.address && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {business.address}
            </p>
          )}
          {business.phone && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              Tel: {business.phone}
            </p>
          )}

          <div className="my-5 border-t border-dashed border-slate-200" />

          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
            TICKET DE VENTA
          </p>
          <p className="mt-1 text-xl font-black text-slate-900">
            N° {formatReceiptNumber(sale.id)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-left">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Fecha
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">
                {formatDate(sale.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Hora
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">
                {formatTime(sale.createdAt)}
              </p>
            </div>
          </div>
        </header>

        <section className="px-6 pb-5">
          <div className="rounded-2xl border border-slate-100 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Cliente
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Cliente:</span>
                <span className="text-right font-bold text-slate-800">
                  {sale.customerName || "Consumidor Final"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Documento:</span>
                <span className="text-right font-bold text-slate-800">-</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Teléfono:</span>
                <span className="text-right font-bold text-slate-800">
                  {sale.customerWhatsapp || "-"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-5">
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="grid grid-cols-[44px_1fr_72px_72px] gap-2 bg-slate-50 px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <span>Cant.</span>
              <span>Descripción</span>
              <span className="text-right">Unit.</span>
              <span className="text-right">Total</span>
            </div>

            {sale.items.map((item, index) => (
              <div
                key={`${sale.id}-receipt-${index}`}
                className="grid grid-cols-[44px_1fr_72px_72px] gap-2 border-t border-slate-100 px-3 py-3 text-xs"
              >
                <span className="font-black text-slate-900">{item.qty}</span>
                <span className="min-w-0 font-semibold text-slate-700">
                  {item.name}
                </span>
                <span className="text-right font-bold tabular-nums text-slate-600">
                  ${formatMoney(getLineUnitPrice(item))}
                </span>
                <span className="text-right font-black tabular-nums text-slate-900">
                  ${formatMoney(getLineTotal(item))}
                </span>
              </div>
            ))}

            {sale.items.length === 0 && (
              <div className="border-t border-slate-100 px-3 py-6 text-center text-xs font-bold text-slate-400">
                Sin items registrados
              </div>
            )}
          </div>
        </section>

        <section className="px-6 pb-5">
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums text-slate-700">
                  ${formatMoney(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Descuentos</span>
                <span className="font-bold tabular-nums text-slate-700">
                  ${formatMoney(discounts)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Impuestos</span>
                <span className="font-bold tabular-nums text-slate-700">
                  ${formatMoney(taxes)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total
              </span>
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                ${formatMoney(total)}
              </span>
            </div>
          </div>
        </section>

        <section className="px-6 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Método de pago
              </p>
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                {paymentMethodLabel(sale.paymentMethod)}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Estado
              </p>
              <span
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${statusBadgeClass(sale.status)}`}
              >
                {statusStyles.label}
              </span>
            </div>
          </div>
        </section>

        <section className="px-6 pb-5">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-xs font-semibold leading-relaxed text-amber-900">
                Este ticket es únicamente un comprobante interno de la operación registrada en la plataforma.
                <br />
                <br />
                NO constituye factura electrónica ni comprobante fiscal válido ante organismos tributarios.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="no-print border-t border-slate-100 bg-white p-4">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 px-2 py-3 text-[10px] font-black uppercase tracking-tight text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={isExporting}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 px-2 py-3 text-[10px] font-black uppercase tracking-tight text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Descargar
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={isExporting}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 px-2 py-3 text-[10px] font-black uppercase tracking-tight text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            Compartir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-900 px-2 py-3 text-[10px] font-black uppercase tracking-wide text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </footer>
    </article>
  );
}

export default function SaleReceiptModal({
  open,
  sale,
  onClose,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
}) {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!open || !sale) return null;

  async function exportReceiptAsPng(): Promise<File | null> {
    if (typeof window === "undefined" || typeof document === "undefined" || !sale) {
      return null;
    }

    const source = receiptRef.current;
    if (!source) return null;

    setIsExporting(true);
    try {
      const rect = source.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(source.scrollHeight);
      const clone = source.cloneNode(true) as HTMLElement;

      copyComputedStyles(source, clone);
      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;
      clone.style.maxHeight = "none";
      clone.style.overflow = "visible";
      clone.style.background = "#ffffff";

      const serialized = new XMLSerializer().serializeToString(clone);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>
          </foreignObject>
        </svg>
      `;
      const svgUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      );

      try {
        const image = new Image();
        image.decoding = "async";
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("No se pudo generar la imagen del ticket"));
        });
        image.src = svgUrl;
        await loaded;

        const scale = Math.min(window.devicePixelRatio || 2, 3);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas no disponible");

        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/png", 1);
        });
        if (!blob) throw new Error("No se pudo exportar el ticket");

        return new File([blob], `ticket-venta-${sale.id}.png`, {
          type: "image/png",
        });
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar el ticket.");
      return null;
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrint() {
    if (typeof window === "undefined") return;
    window.print();
  }

  async function handleDownload() {
    const file = await exportReceiptAsPng();
    if (!file) return;
    downloadFile(file);
  }

  async function handleShare() {
    if (typeof navigator === "undefined") return;

    const file = await exportReceiptAsPng();
    if (!file) return;

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    const shareData: ShareData = {
      title: "Ticket de venta",
      text: "Comprobante interno de venta",
      files: [file],
    };

    if (nav.share && (!nav.canShare || nav.canShare(shareData))) {
      try {
        await nav.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      }
    }

    downloadFile(file);
    toast("Tu navegador no permite compartir archivos. Se descargó el ticket.");
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/40 px-3 pb-0 pt-8 backdrop-blur-sm sm:items-center sm:p-6">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #sale-receipt-print-area,
          #sale-receipt-print-area * {
            visibility: visible;
          }

          #sale-receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-height: none !important;
            overflow: visible !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="w-full animate-in slide-in-from-bottom-8 fade-in duration-200 sm:slide-in-from-bottom-0">
        <div className="no-print mb-3 flex justify-end sm:hidden">
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-500 shadow-sm"
            aria-label="Cerrar comprobante"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SaleReceiptView
          sale={sale}
          receiptRef={receiptRef}
          isExporting={isExporting}
          onClose={onClose}
          onPrint={handlePrint}
          onDownload={handleDownload}
          onShare={handleShare}
        />
      </div>
    </div>
  );
}
