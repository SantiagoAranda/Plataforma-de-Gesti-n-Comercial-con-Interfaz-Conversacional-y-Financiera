"use client";

import { useState, useEffect } from "react";
import { X, Pencil, Trash2, Loader2, AlertTriangle, Check, UserX } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import SalesChatComposer from "./SalesChatComposer";
import { useSaleBadge, canUseSaleAction } from "@/src/lib/sales/salePresentation";
import { getSaleOriginLabel, getSaleOriginStyles } from "@/src/lib/saleOrigin";
import { getCached } from "@/src/lib/cache";
import { api } from "@/src/lib/api";

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
  onCancelReservation,
  onNoShow,
  onComplete,
  onSaveOptionalIngredients, // kept for TS signature compatibility
  confirming = false,
  taxSettingsEnabled = false,
}: {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onEdit?: (sale: Sale) => void;
  onConfirm?: (sale: Sale) => void;
  onComplete?: (sale: Sale) => void;
  onCancel?: (sale: Sale) => void;
  // Cancels (not deletes) a standalone reservation, freeing its slot.
  onCancelReservation?: (sale: Sale) => void;
  onNoShow?: (sale: Sale) => void;
  onSaveOptionalIngredients?: (
    sale: Sale,
    orderItemId: string,
    excludedOptionalIngredientIds: string[],
  ) => Promise<void>;
  confirming?: boolean;
  taxSettingsEnabled?: boolean;
}) {
  const [hasPriceDivergence, setHasPriceDivergence] = useState(false);

  useEffect(() => {
    if (!sale || sale.status === "CERRADO" || sale.status === "CONFIRMADO" || sale.status === "FINALIZADA" || sale.status === "CANCELADO" || !sale.items?.length) {
      setHasPriceDivergence(false);
      return;
    }

    let isMounted = true;
    getCached<any[]>("sales-catalog-items", 30000, () => api<any[]>("/items?context=sales"))
      .then((catalogItems) => {
        if (!isMounted || !catalogItems?.length) return;
        const divergence = sale.items.some((it) => {
          const bi = catalogItems.find((b) => b.id === it.itemId);
          if (!bi) return false;
          let optionsDelta = 0;
          const selections = it.optionSelections ?? it.options;
          if (bi.optionGroups && selections?.length) {
            for (const sel of selections) {
              if (sel.action === "REMOVE") continue;
              const group = bi.optionGroups.find((g: any) => g.id === sel.groupId);
              const opt = group?.options?.find((o: any) => o.id === sel.optionId);
              if (opt) optionsDelta += Number(opt.priceDelta ?? 0);
            }
          }
          const expectedCatalogPrice = Number(bi.price) + optionsDelta;
          const unitPrice = typeof it.unitPrice === "number" && Number.isFinite(it.unitPrice) && it.unitPrice > 0
            ? it.unitPrice
            : (it.qty > 0 && typeof it.price === "number" ? it.price / it.qty : it.unitPrice ?? 0);

          return Math.abs(expectedCatalogPrice - unitPrice) > 0.01;
        });

        setHasPriceDivergence(divergence);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [sale]);

  const presentation = useSaleBadge(sale);
  if (!open || !sale) return null;

  const canConfirm = canUseSaleAction(sale, "confirm");
  const canEditSale = Boolean(onEdit) && canUseSaleAction(sale, "edit");
  const canComplete = Boolean(onComplete) && canUseSaleAction(sale, "complete");
  const canNoShow = Boolean(onNoShow) && canUseSaleAction(sale, "noShow");
  const headerIconClass = "w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition disabled:opacity-50";

  const total = sale.total ?? sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
  const hasFiscalSummary = Boolean(sale.fiscalSummary) && (
    taxSettingsEnabled ||
    Number(sale.fiscalSummary?.iva ?? 0) > 0 ||
    Number(sale.fiscalSummary?.impoconsumo ?? 0) > 0 ||
    Number(sale.fiscalSummary?.reteFuente ?? 0) > 0 ||
    Number(sale.fiscalSummary?.reteIva ?? 0) > 0 ||
    Number(sale.fiscalSummary?.reteIca ?? 0) > 0
  );
  const footerLabel = hasFiscalSummary ? "TOTAL COBRADO" : "SUBTOTAL";
  const footerValue = hasFiscalSummary
    ? Number(sale.fiscalSummary?.subtotal ?? total) +
    Number(sale.fiscalSummary?.iva ?? 0) +
    Number(sale.fiscalSummary?.impoconsumo ?? 0)
    : total;

  const statusStyles = presentation!.styles;
  const originLabel = getSaleOriginLabel(sale.origin);
  const originStyles = getSaleOriginStyles(sale.origin);
  const paymentMethodText = sale.paymentMethod === "BANK_TRANSFER" ? "Transferencia" : "Efectivo";
  const paymentMethodStyles =
    sale.paymentMethod === "BANK_TRANSFER"
      ? "bg-teal-50 text-teal-700 border border-teal-100"
      : "bg-amber-100 text-amber-900 border border-amber-300 font-semibold";

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
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <h2 className="font-semibold text-slate-900 text-base truncate">Detalle de Venta</h2>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                #{sale.id?.slice(-8) || "N/A"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {canEditSale && (
                <button
                  type="button"
                  onClick={() => onEdit?.(sale)}
                  disabled={confirming}
                  className={headerIconClass}
                  title="Editar"
                  aria-label="Editar venta"
                >
                  <Pencil size={17} />
                </button>
              )}
              {/* An active reservation is cancelled, not deleted: one destructive icon only. Both open their existing confirmation. */}
              {onCancelReservation && canUseSaleAction(sale, "cancel") ? (
                <button
                  type="button"
                  onClick={() => onCancelReservation(sale)}
                  disabled={confirming}
                  className={`${headerIconClass} text-rose-500 hover:bg-rose-50 hover:text-rose-600`}
                  title="Cancelar reserva"
                  aria-label="Cancelar reserva"
                >
                  <Trash2 size={17} />
                </button>
              ) : onCancel && !onCancelReservation && canUseSaleAction(sale, "delete") && (
                <button
                  type="button"
                  onClick={handleCancelAction}
                  disabled={confirming}
                  className={`${headerIconClass} text-rose-500 hover:bg-rose-50 hover:text-rose-600`}
                  title="Eliminar"
                  aria-label="Eliminar venta"
                >
                  <Trash2 size={17} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={headerIconClass}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusStyles.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyles.dotColor}`} />
              {statusStyles.label}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${paymentMethodStyles}`}>
              {paymentMethodText}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${originStyles}`}>
              {originLabel}
            </span>
          </div>
        </div>

        {/* Scrollable Body embedding read-only Composer */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/30">
          <SalesChatComposer
            mode="readonly"
            sale={sale}
            expanded={true}
            onCancelComposer={onClose}
            onSave={() => { }}
            taxSettingsEnabled={taxSettingsEnabled}
          />
        </div>

        {/* Footer Section */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100/50 shrink-0 flex flex-col gap-3">
          {hasPriceDivergence && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>
                  El precio registrado en esta venta difiere del precio actual del catálogo.
                </span>
              </div>
              {canEditSale && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(sale)}
                  className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] px-2.5 py-1 transition active:scale-95 shadow-xs"
                >
                  Actualizar precio
                </button>
              )}
            </div>
          )}

          {/* One row; on narrow widths or large amounts the actions wrap below instead of truncating the total. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none mb-1">
                {footerLabel}
              </span>
              <span className="text-xl font-bold text-slate-900 leading-none whitespace-nowrap">
                ${formatMoney(footerValue)}
              </span>
            </div>

            {(canNoShow || canComplete || (canConfirm && onConfirm)) && (
            <div className="ml-auto flex items-center gap-2">
            {canNoShow && (
              <button
                type="button"
                onClick={() => onNoShow?.(sale)}
                disabled={confirming}
                className="h-11 px-3 inline-flex items-center gap-1.5 rounded-full border border-rose-300 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition active:scale-95 disabled:opacity-50 whitespace-nowrap"
                aria-label="No asistió"
                title="No asistió"
              >
                <UserX size={15} aria-hidden="true" />
                Ausente
              </button>
            )}
            {canComplete && (
              <button
                type="button"
                onClick={() => onComplete?.(sale)}
                disabled={confirming}
                className="h-11 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800 transition active:scale-95 disabled:opacity-50 whitespace-nowrap"
                aria-label="Finalizar atención"
                title="Finalizar atención"
              >
                <Check size={15} aria-hidden="true" />
                Finalizar
              </button>
            )}
            {canConfirm && onConfirm && (
              <button
                onClick={handleConfirmAction}
                disabled={confirming}
                className="h-10 px-5 shrink-0 rounded-full bg-emerald-600 text-white font-medium text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {confirming ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : "Confirmar"}
              </button>
            )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
