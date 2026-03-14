"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { Sale } from "@/src/types/sales";
import { useLongPress } from "@/src/components/shared/selection/useLongPress";
import { getStatusStyles } from "@/src/lib/statusStyles";

function typeLabel(type: Sale["type"]) {
  return type === "PRODUCTO" ? "Producto" : "Servicio";
}

function calcTotal(sale: Sale) {
  return sale.items.reduce((acc, it) => acc + (it.price ?? 0), 0);
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type Props = {
  sale: Sale;
  selected?: boolean;
  onSelect?: () => void;
  onDetails?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
};

export default function SaleCard({
  sale,
  selected = false,
  onSelect,
  onDetails,
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
      className={`relative w-full select-none transition-all cursor-pointer ${
        selected 
          ? "bg-emerald-50 ring-2 ring-emerald-500/50 shadow-md" 
          : "bg-white shadow-sm hover:shadow-md"
      } rounded-2xl rounded-tl-none p-4 ${styles.border}`}
    >
      {/* HEADER */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-[15px] leading-tight text-left">
            {sale.customerName}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-[11px] text-gray-500">
              {typeLabel(sale.type)}
            </p>
            {sale.origin && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                {sale.origin === "ORDEN PUBLICA" ? "Orden publica" : "Venta interna"}
              </span>
            )}
          </div>
        </div>

        <span
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${styles.badge}`}
        >
          {styles.label}
        </span>
      </div>

      {/* ITEMS */}
      <div className="space-y-2 border-t border-gray-100 pt-3 mb-4">
        {sale.items.map((it, idx) => (
          <div
            key={`${sale.id}-${idx}`}
            className="flex justify-between text-[13px] text-gray-700"
          >
            <span className="truncate">
              {it.qty}x {it.name}
            </span>

            <span className="font-medium text-gray-800">
              ${it.price.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* TOTAL */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs uppercase tracking-wide text-gray-400">
          Total
        </span>

        <span className="text-xl font-extrabold text-gray-900">
          ${total.toFixed(2)}
        </span>
      </div>

      {/* WHATSAPP */}
      {onSendWhatsApp && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSendWhatsApp(sale);
          }}
          disabled={!sale.customerWhatsapp}
          className="w-full bg-[#11d473] hover:brightness-95 active:scale-[0.98] transition-all text-white font-semibold py-3 rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Enviar WhatsApp
        </button>
      )}

      {/* TIME */}
      <div className="flex justify-end mt-2">
        <span className="text-[10px] text-gray-400">
          {formatTime(sale.createdAt)}
        </span>
      </div>
    </div>
  );
}
