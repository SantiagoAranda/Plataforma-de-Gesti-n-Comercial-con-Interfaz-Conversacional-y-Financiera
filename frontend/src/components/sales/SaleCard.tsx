"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { Sale } from "@/src/types/sales";

import { useContextMenu } from "@/src/hooks/useContextMenu";
import ContextMenu from "@/src/components/common/ContextMenu";
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
  onEdit?: (sale: Sale) => void;
  onDetails?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
};

export default function SaleCard({
  sale,
  onEdit,
  onDetails,
  onSendWhatsApp,
}: Props) {
  const router = useRouter();
  const menu = useContextMenu(500);

  const longPressTriggered = useRef(false);

  const total = calcTotal(sale);
  const styles = getStatusStyles(sale.status);

  const handleEdit = () => {
    if (onEdit) return onEdit(sale);
    router.push(`/ventas/${sale.id}/editar`);
  };

  const handleDetails = () => {
    if (onDetails) return onDetails(sale);
    router.push(`/ventas/${sale.id}`);
  };

  return (
    <>
      <div className="flex flex-col gap-1 items-start max-w-[92%]">
        <div
          {...menu.handlers}
          onPointerDown={(e) => {
            longPressTriggered.current = false;
            menu.handlers.onPointerDown(e);
          }}
          onContextMenu={(e) => {
            longPressTriggered.current = true;
            menu.handlers.onContextMenu(e);
          }}
          onClick={() => {
            if (longPressTriggered.current) return;
            handleDetails();
          }}
          className={`bg-white rounded-2xl rounded-tl-none p-4 shadow-sm w-full select-none transition-all hover:shadow-md cursor-pointer ${styles.border}`}
        >
          {/* HEADER */}
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">
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
      </div>

      <ContextMenu
        open={menu.open}
        x={menu.pos.x}
        y={menu.pos.y}
        onClose={menu.close}
        items={[
          ...(onEdit ? [{ label: "Editar", onClick: handleEdit }] : []),
          { label: "Ver detalles", onClick: handleDetails },
        ]}
      />
    </>
  );
}
