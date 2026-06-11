"use client";

import { useRouter } from "next/navigation";
import { CheckCheck, ExternalLink, MessageCircle, MoreVertical, ShieldCheck, User } from "lucide-react";
import type { Sale } from "@/src/types/sales";
import { useLongPress } from "@/src/components/shared/selection/useLongPress";
import { getStatusStyles } from "@/src/lib/statusStyles";
import { formatBusinessTime } from "@/src/lib/businessDate";

function calcTotal(sale: Sale) {
  if (sale.total !== undefined) return sale.total;
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatRef(id: string) {
  return `#${id.slice(0, 4).toUpperCase()}`;
}

function formatDisplayMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return formatBusinessTime(d);
}

function formatAppointment(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  sale: Sale;
  selected?: boolean;
  onSelect?: () => void;
  onDetails?: (sale: Sale) => void;
  onReceipt?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
};

export default function SaleCard({
  sale,
  selected = false,
  onSelect,
  onDetails,
  onReceipt,
  onSendWhatsApp,
}: Props) {
  const router = useRouter();

  const { handlers, consumeLongPress } = useLongPress({
    onLongPress: () => {
      if (!selected) {
        onSelect?.();
      }
    },
    delay: 450,
  });

  const total = calcTotal(sale);
  const styles = getStatusStyles(sale.status);
  const validationLabel = sale.status === "CERRADO" ? "Validado" : styles.label;

  const handleDetails = () => {
    if (consumeLongPress()) return;
    if (selected) {
      onSelect?.();
      return;
    }
    if (onDetails) return onDetails(sale);
    router.push(`/ventas/${sale.id}`);
  };

  return (
    <div
      {...handlers}
      onClick={handleDetails}
      onContextMenu={(e) => {
        e.preventDefault();
        if (consumeLongPress()) return;
        onSelect?.();
      }}
      className={`bg-white rounded-xl shadow-sm border overflow-hidden select-none transition-all cursor-pointer ${
        selected 
          ? "border-emerald-300 ring-2 ring-emerald-500/30 shadow-md" 
          : "border-slate-100 hover:shadow-md"
      }`}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-3 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
              <User className="w-5 h-5 text-slate-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-slate-800 leading-tight truncate">
                {sale.customerName ?? "Consumidor Final"}
              </h3>
              <p className="text-[10px] text-slate-400 font-normal">
                Ref: {formatRef(sale.id)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 uppercase">
              {styles.label}
            </span>
            <button
              type="button"
              aria-label="Ver detalles"
              onClick={(e) => {
                e.stopPropagation();
                if (onDetails) return onDetails(sale);
                router.push(`/ventas/${sale.id}`);
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-slate-300 hover:bg-slate-50"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="bg-slate-50/50 rounded-xl p-3 mb-3 border border-slate-100">
          <div className="space-y-2">
            {sale.items.map((it, idx) => (
              <div
                key={`${sale.id}-${idx}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="flex-1 text-slate-600 font-medium truncate">
                  {it.name}
                </span>
                <span className="bg-white border border-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded-lg min-w-[28px] text-center shadow-sm text-[10px]">
                  {it.qty}
                </span>
                <span className="font-semibold text-slate-700 tabular-nums min-w-[60px] text-right">
                  ${formatDisplayMoney((it.unitPrice ?? it.price ?? 0) * it.qty)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 mt-1 border-t border-slate-200/60 flex justify-between items-center gap-3">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Monto total
            </span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              ${formatDisplayMoney(total)}
            </span>
          </div>

          {sale.type === "SERVICIO" && sale.scheduledAt && (
            <div className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
              Turno: {formatAppointment(sale.scheduledAt)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onSendWhatsApp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSendWhatsApp(sale);
              }}
              disabled={!sale.customerWhatsapp}
              className="flex-[2] flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5b] text-white py-2.5 rounded-xl font-medium text-xs transition-colors shadow-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle className="h-3.5 w-3.5 fill-white" />
              WhatsApp
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onReceipt) return onReceipt(sale);
              if (onDetails) return onDetails(sale);
              router.push(`/ventas/${sale.id}`);
            }}
            className="flex-[1] flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 py-2.5 rounded-xl font-medium text-[10px] hover:bg-slate-50 transition-colors uppercase tracking-tight"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver factura
          </button>
        </div>

        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1.5 flex-wrap">
            {sale.origin && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                {sale.origin === "PUBLIC_STORE" ? "Catálogo" : "Manual"}
              </span>
            )}
            {sale.paymentMethod && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                {sale.paymentMethod === "BANK_TRANSFER" ? "Transferencia" : "Efectivo"}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 shrink-0">
            {formatTime(sale.createdAt)}
            <CheckCheck className="w-4 h-4 text-[#34b7f1]" />
          </span>
        </div>
      </div>
    </div>
  );
}
