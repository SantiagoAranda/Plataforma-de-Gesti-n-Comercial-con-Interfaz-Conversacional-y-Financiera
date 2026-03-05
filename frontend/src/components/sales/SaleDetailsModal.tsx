"use client";

import type { Sale } from "@/src/types/sales";
import { generateInvoicePdf } from "@/src/lib/invoicePdf";
import { getStatusStyles } from "@/src/lib/statusStyles";

function formatMoney(n: number) {
  return (n ?? 0).toFixed(2);
}

function calcTotal(sale: Sale) {
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatDateTime(iso?: string) {
  if (!iso) return "—";

  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: Sale["type"]) {
  return type === "PRODUCTO" ? "Producto" : "Servicio";
}

export default function SaleDetailsModal({
  open,
  sale,
  onClose,
  onEdit,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onEdit?: (sale: Sale) => void;
}) {
  if (!open || !sale) return null;

  const total = calcTotal(sale);
  const styles = getStatusStyles(sale.status);

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* HEADER */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900 text-lg">
            Detalles de venta
          </h2>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-neutral-100 transition"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5 space-y-5 overflow-y-auto">

          {/* CLIENTE */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Cliente
            </div>

            <div className="text-base font-semibold text-neutral-900 break-words">
              {sale.customerName}
            </div>
          </div>

          {/* WHATSAPP */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              WhatsApp
            </div>

            <div className="text-sm text-neutral-900 break-words">
              {sale.customerWhatsapp?.trim() || "—"}
            </div>
          </div>

          {/* INFO GRID */}
          <div className="grid grid-cols-2 gap-4">

            <div className="space-y-1">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Tipo
              </div>

              <div className="text-sm text-neutral-900">
                {typeLabel(sale.type)}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Estado
              </div>

              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${styles.badge}`}
              >
                {styles.label}
              </span>
            </div>

          </div>

          {/* FECHA */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Fecha
            </div>

            <div className="text-sm text-neutral-900">
              {formatDateTime(sale.createdAt)}
            </div>
          </div>

          {/* TURNO */}
          {sale.type === "SERVICIO" && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                Turno
              </div>

              <div className="text-sm text-neutral-900">
                {sale.scheduledAt
                  ? formatDateTime(sale.scheduledAt)
                  : "—"}
              </div>
            </div>
          )}

          {/* ITEMS */}
          <div className="border-t border-neutral-200 pt-4">

            <div className="text-sm font-semibold text-neutral-900 mb-3">
              Ítems
            </div>

            <div className="space-y-3">

              {sale.items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center bg-neutral-50 rounded-xl px-3 py-2"
                >
                  <span className="text-sm text-neutral-700 break-words">

                    {sale.type === "PRODUCTO" && `${it.qty}x `}

                    {it.name}

                    {sale.type === "SERVICIO" && it.durationMin && (
                      <span className="text-neutral-500">
                        {" "}• {it.durationMin} min
                      </span>
                    )}

                  </span>

                  <span className="text-sm font-semibold text-neutral-900 shrink-0">
                    ${formatMoney(it.price)}
                  </span>

                </div>
              ))}

            </div>

            {/* TOTAL */}
            <div className="flex justify-between items-center mt-5 pt-4 border-t border-neutral-200">

              <span className="text-sm text-neutral-500">
                Total
              </span>

              <span className="text-2xl font-bold text-neutral-900">
                ${formatMoney(total)}
              </span>

            </div>

          </div>

          {/* BOTONES */}
          <div className="space-y-3 pt-2">

            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(sale);
                }}
                className="w-full bg-neutral-200 text-neutral-900 rounded-xl py-3 font-semibold hover:bg-neutral-300 transition"
              >
                Editar venta
              </button>
            )}

            <button
              onClick={() =>
                generateInvoicePdf({
                  sale,
                  businessName: "Mi Negocio",
                  businessPhone: "54911XXXXYYYY",
                  invoiceNumber: `#${sale.id}`,
                  currencySymbol: "$",
                })
              }
              className="w-full bg-[#11d473] text-white rounded-xl py-3 font-semibold hover:brightness-95 transition"
            >
              Descargar PDF
            </button>

            <button
              onClick={onClose}
              className="w-full bg-neutral-900 text-white rounded-xl py-3 font-semibold hover:brightness-95 transition"
            >
              Cerrar
            </button>

          </div>

        </div>
      </div>
    </div>
  );
}