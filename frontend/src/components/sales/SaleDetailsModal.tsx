"use client";

import { useState } from "react";
import { Info, X, Check, Edit, Loader2, MoreVertical, AlertTriangle } from "lucide-react";

import type { Sale } from "@/src/types/sales";
import { getStatusStyles } from "@/src/lib/statusStyles";

function formatMoney(n: number) {
  return (n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function calcTotal(sale: Sale) {
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: Sale["type"]) {
  return type === "PRODUCTO" ? "Venta Directa" : "Servicio";
}

function paymentMethodLabel(paymentMethod?: Sale["paymentMethod"]) {
  return paymentMethod === "BANK_TRANSFER" ? "Transferencia" : "Efectivo";
}

function ItemThumbnail() {
  return (
    <div className="h-12 w-12 shrink-0 rounded-xl bg-neutral-100 flex items-center justify-center overflow-hidden">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
      </svg>
    </div>
  );
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
  const canConfirm = sale.status === "PENDIENTE" || sale.status === "PENDIENTE DE CIERRE";

  const handleConfirmAction = () => {
    if (onConfirm && sale) onConfirm(sale);
  };

  const handleCancelAction = () => {
    if (onCancel && sale) onCancel(sale);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] sm:h-auto animate-in slide-in-from-bottom-full duration-300">

        {/* HEADER */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
            <h2 className="font-bold text-neutral-900 text-lg">Detalle de Venta</h2>
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{sale.id?.slice(-6) || 'N/A'}</span>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/30">
          
          {/* INFO GRID */}
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Cliente</span>
                <span className="text-sm font-semibold text-neutral-800">{sale.customerName}</span>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">WhatsApp</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {sale.customerWhatsapp || "-"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-50">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Tipo</span>
                <span className="text-sm font-semibold text-neutral-700">{typeLabel(sale.type)}</span>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Estado</span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${styles.dotColor || 'bg-neutral-300'}`} />
                  <span className="text-sm font-semibold text-neutral-700">{styles.label}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-50">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Medio de pago</span>
              <span className="text-sm font-semibold text-neutral-700">
                {paymentMethodLabel(sale.paymentMethod)}
              </span>
            </div>

            {sale.type === "SERVICIO" && sale.scheduledAt && (
              <div className="pt-3 border-t border-neutral-50">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Horario reservado</span>
                <span className="text-sm font-semibold text-neutral-700">{formatDateTime(sale.scheduledAt)}</span>
              </div>
            )}

            {sale.origin && (
              <div className="pt-3 border-t border-neutral-50">
                <p className="text-[11px] text-neutral-500 font-medium italic">
                  {sale.origin === "PUBLIC_STORE" ? "Orden recibida desde el catálogo público" : "Venta generada manualmente desde el sistema"}
                </p>
              </div>
            )}
          </div>

          {/* ITEM LIST */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">Items de la venta</span>
            
            <div className="space-y-3">
              {sale.items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-2xl shadow-sm">
                  <ItemThumbnail />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-neutral-800 text-sm truncate">{it.name}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase">
                      {it.qty} unidades {it.durationMin ? `• ${it.durationMin} min` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-black text-neutral-900">
                    ${formatMoney(it.price)}
                  </div>
                </div>
              ))}
            </div>

            {sale.items.length === 0 && (
              <div className="text-center py-8 opacity-40">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Sin items registrados</p>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS (REFINTED & COMPACT & HORIZONTAL) */}
        <div className="p-4 sm:p-5 bg-white border-t border-neutral-100/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Total Venta</span>
              <span className="text-xl font-black text-neutral-900 leading-none truncate">${formatMoney(total)}</span>
            </div>

            <div className="flex items-center gap-2">
              {onCancel && (
                <button 
                  onClick={handleCancelAction}
                  disabled={confirming}
                  className="h-10 px-4 rounded-full border border-rose-100 text-rose-500 font-bold text-[11px] uppercase tracking-widest hover:bg-rose-50 transition active:scale-95 whitespace-nowrap disabled:opacity-50"
                >
                  Eliminar
                </button>
              )}

              {canConfirm && onConfirm ? (
                <button 
                  onClick={handleConfirmAction}
                  disabled={confirming}
                  className="h-10 px-6 rounded-full bg-emerald-600 text-white font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center min-w-[100px] whitespace-nowrap"
                >
                  {confirming ? <Loader2 className="animate-spin" size={16} /> : 'Confirmar'}
                </button>
              ) : (
                <button 
                  onClick={onClose}
                  className="h-10 px-6 rounded-full bg-neutral-900 text-white font-bold text-[11px] uppercase tracking-widest hover:brightness-110 transition active:scale-95 whitespace-nowrap"
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
