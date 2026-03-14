"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

import type { Sale } from "@/src/types/sales";
import { getStatusStyles } from "@/src/lib/statusStyles";

function formatMoney(n: number) {
  return (n ?? 0).toFixed(2);
}

function calcTotal(sale: Sale) {
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";

  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";

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
  onConfirm,
  onCancel,
  confirming = false,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onEdit?: (sale: Sale) => void;
  onConfirm?: (sale: Sale) => void;
  onCancel?: (sale: Sale) => void;
  confirming?: boolean;
}) {
  const [showStatusHelp, setShowStatusHelp] = useState(false);

  if (!open || !sale) return null;

  const total = calcTotal(sale);
  const styles = getStatusStyles(sale.status);
  const canConfirm =
    sale.status === "PENDIENTE" || sale.status === "PENDIENTE DE CIERRE";
  const canEdit =
    sale.status === "PENDIENTE" || sale.status === "PENDIENTE DE CIERRE";
  const ctaLabel =
    sale.status === "PENDIENTE DE CIERRE"
      ? "Finalizar venta y contabilizar"
      : "Finalizar venta";

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            Detalles de venta
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowStatusHelp((current) => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100"
              aria-label="Explicar estados de la venta"
              title="Explicar estados de la venta"
            >
              <Info className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition hover:bg-neutral-100"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          {showStatusHelp && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              <div className="font-semibold text-neutral-900">
                Estados de la venta
              </div>
              <div className="mt-2">
                <strong>PENDIENTE:</strong> venta creada pero todavia no enviada
                ni cerrada.
              </div>
              <div>
                <strong>PENDIENTE DE CIERRE:</strong> orden enviada, pendiente
                de cierre contable.
              </div>
              <div>
                <strong>CERRADO:</strong> venta finalizada y contabilizada.
              </div>
              <div>
                <strong>CANCELADO:</strong> venta anulada sin cierre.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Cliente
              </div>

              <div className="break-words text-base font-semibold text-neutral-900">
                {sale.customerName}
              </div>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                WhatsApp
              </div>

              <div className="break-words text-sm text-neutral-900">
                {sale.customerWhatsapp?.trim() || "-"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Tipo
              </div>

              <div className="text-sm text-neutral-900">
                {typeLabel(sale.type)}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Estado
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${styles.badge}`}
              >
                {styles.label}
              </span>
            </div>
          </div>

          {sale.origin && (
            <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
              Origen:{" "}
              {sale.origin === "ORDEN PUBLICA"
                ? "Orden publica enviada desde la tienda"
                : "Venta interna creada desde el sistema"}
              .
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Fecha
            </div>

            <div className="text-sm text-neutral-900">
              {formatDateTime(sale.createdAt)}
            </div>
          </div>

          {sale.status === "PENDIENTE DE CIERRE" && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Esta orden ya fue enviada, pero todavia no esta cerrada ni
              contabilizada. Usa el cierre para generar contabilidad e impactar
              en movimientos.
            </div>
          )}

          {sale.type === "SERVICIO" && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Turno
              </div>

              <div className="text-sm text-neutral-900">
                {sale.scheduledAt ? formatDateTime(sale.scheduledAt) : "-"}
              </div>
            </div>
          )}

          <div className="border-t border-neutral-200 pt-4">
            <div className="mb-3 text-sm font-semibold text-neutral-900">
              Items
            </div>

            <div className="space-y-3">
              {sale.items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2"
                >
                  <span className="break-words text-sm text-neutral-700">
                    {sale.type === "PRODUCTO" && `${it.qty}x `}
                    {it.name}
                    {sale.type === "SERVICIO" && it.durationMin && (
                      <span className="text-neutral-500">
                        {" "} - {it.durationMin} min
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-sm font-semibold text-neutral-900">
                    ${formatMoney(it.price)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4">
              <span className="text-sm text-neutral-500">
                Total
              </span>

              <span className="text-2xl font-bold text-neutral-900">
                ${formatMoney(total)}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {canConfirm && onConfirm && (
              <div className="flex gap-3">
                {onCancel && (
                  <button
                    onClick={() => onCancel(sale)}
                    className="flex-1 rounded-xl bg-rose-50 py-3 font-semibold text-rose-600 transition hover:bg-rose-100"
                  >
                    Anular venta
                  </button>
                )}
                <button
                  onClick={() => onConfirm(sale)}
                  disabled={confirming}
                  className="flex-[2] rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirming ? "Finalizando..." : ctaLabel}
                </button>
              </div>
            )}

            {canEdit && onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(sale);
                }}
                className="w-full rounded-xl bg-neutral-200 py-3 font-semibold text-neutral-900 transition hover:bg-neutral-300"
              >
                Editar venta
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-neutral-900 py-3 font-semibold text-white transition hover:brightness-95"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
