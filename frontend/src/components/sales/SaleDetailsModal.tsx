"use client";

import { X, Pencil, Trash2, Loader2 } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import SalesChatComposer from "./SalesChatComposer";
import { getStatusStyles } from "@/src/lib/statusStyles";
import { getSaleOriginLabel, getSaleOriginStyles } from "@/src/lib/saleOrigin";

function formatMoney(n: number) {
  return (n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function SaleDetailsModal({
  open,
  sale,
  onClose,
  onEdit,
  onConfirm,
  onCancel,
  onSaveOptionalIngredients, // kept for TS signature compatibility
  confirming = false,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onEdit?: (sale: Sale) => void;
  onConfirm?: (sale: Sale) => void;
  onCancel?: (sale: Sale) => void;
  onSaveOptionalIngredients?: (
    sale: Sale,
    orderItemId: string,
    excludedOptionalIngredientIds: string[],
  ) => Promise<void>;
  confirming?: boolean;
}) {
  if (!open || !sale) return null;

  const canConfirm = sale.status === "PENDIENTE" || sale.status === "PENDIENTE DE CIERRE";
  const canEditSale =
    Boolean(onEdit) &&
    canConfirm &&
    sale.sourceType === "ORDER" &&
    !sale.inventoryPostedAt &&
    !sale.accountingPostedAt;

  const total = sale.total ?? sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
  const hasFiscalSummary = Boolean(sale.fiscalSummary);
  const footerLabel = hasFiscalSummary ? "TOTAL COBRADO" : "SUBTOTAL";
  const footerValue = hasFiscalSummary
    ? Number(sale.fiscalSummary?.subtotal ?? total) +
      Number(sale.fiscalSummary?.iva ?? 0) +
      Number(sale.fiscalSummary?.impoconsumo ?? 0)
    : total;

  const statusStyles = getStatusStyles(sale.status);
  const originLabel = getSaleOriginLabel(sale.origin);
  const originStyles = getSaleOriginStyles(sale.origin);
  const paymentMethodText = sale.paymentMethod === "BANK_TRANSFER" ? "Transferencia" : "Efectivo";
  const paymentMethodStyles =
    sale.paymentMethod === "BANK_TRANSFER"
      ? "bg-teal-50 text-teal-700 border border-teal-100"
      : "bg-amber-50 text-amber-700 border border-amber-100";

  const handleConfirmAction = () => {
    if (onConfirm) onConfirm(sale);
  };

  const handleCancelAction = () => {
    if (onCancel) onCancel(sale);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-white rounded-t-[32px] sm:rounded-2xl shadow-2xl overflow-hidden h-[90vh] sm:h-auto sm:max-h-[85vh] relative animate-in slide-in-from-bottom-full duration-300">
        {/* Header Section */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex flex-col min-w-0">
            <h2 className="font-semibold text-slate-900 text-base truncate">Detalle de Venta</h2>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
              #{sale.id?.slice(-8) || "N/A"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-4">
            {canEditSale && (
              <button
                onClick={() => onEdit?.(sale)}
                disabled={confirming}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition disabled:opacity-50"
                title="Editar"
                aria-label="Editar venta"
              >
                <Pencil size={16} />
              </button>
            )}
            {onCancel && (
              <button
                onClick={handleCancelAction}
                disabled={confirming}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-rose-100 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50"
                title="Eliminar"
                aria-label="Eliminar venta"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-500"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chips Strip */}
        <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex flex-wrap gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyles.dotColor}`} />
            {statusStyles.label}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${paymentMethodStyles}`}>
            {paymentMethodText}
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${originStyles}`}>
            {originLabel}
          </span>
        </div>

        {/* Scrollable Body embedding read-only Composer */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/30">
          <SalesChatComposer
            mode="readonly"
            sale={sale}
            expanded={true}
            onCancelComposer={onClose}
            onSave={() => {}}
          />
        </div>

        {/* Footer Section */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100/50 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none mb-1">
                {footerLabel}
              </span>
              <span className="text-xl font-bold text-slate-900 leading-none truncate">
                ${formatMoney(footerValue)}
              </span>
            </div>

            <div className="flex items-center shrink-0">
              {canConfirm && onConfirm ? (
                <button
                  onClick={handleConfirmAction}
                  disabled={confirming}
                  className="h-10 px-5 rounded-full bg-emerald-600 text-white font-medium text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {confirming ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Confirmar"}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="h-10 px-5 rounded-full bg-slate-900 text-white font-medium text-[11px] uppercase tracking-widest hover:brightness-110 transition active:scale-95 whitespace-nowrap"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
