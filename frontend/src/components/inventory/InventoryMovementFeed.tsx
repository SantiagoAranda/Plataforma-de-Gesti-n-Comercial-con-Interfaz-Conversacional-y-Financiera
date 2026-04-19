"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import { DateSeparator } from "@/src/components/shared/DateSeparator";
import { formatMoney } from "@/src/lib/formatters";

export type InventoryMovementKind =
  | "PURCHASE"
  | "SALE"
  | "PURCHASE_RETURN"
  | "SALE_RETURN"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE"
  | "LOW_STOCK_ALERT"
  | "OUT_OF_STOCK_ALERT";

export type InventoryMovement = {
  id: string;
  type: InventoryMovementKind;
  itemName: string;
  detail: string;
  quantityImpact: number;
  balance: number;
  unitCost?: number;
  totalValue?: number;
  createdAt: string;
};

function movementMeta(type: InventoryMovementKind) {
  if (type === "LOW_STOCK_ALERT" || type === "OUT_OF_STOCK_ALERT") {
    return {
      label: type === "OUT_OF_STOCK_ALERT" ? "Faltante" : "Stock minimo",
      icon: AlertTriangle,
      className: "border-amber-100 bg-amber-50 text-amber-800",
      bubble: "bg-amber-100 text-amber-700",
    };
  }

  if (type === "SALE" || type === "ADJUSTMENT_NEGATIVE" || type === "PURCHASE_RETURN") {
    return {
      label:
        type === "SALE"
          ? "Salida"
          : type === "PURCHASE_RETURN"
            ? "Dev. compra"
            : "Ajuste -",
      icon: ArrowUpRight,
      className: "border-rose-100 bg-white text-neutral-900",
      bubble: "bg-rose-50 text-rose-600",
    };
  }

  return {
    label:
      type === "PURCHASE"
        ? "Entrada"
        : type === "SALE_RETURN"
          ? "Dev. venta"
          : "Ajuste +",
    icon: type === "SALE_RETURN" ? RotateCcw : ArrowDownLeft,
    className: "border-emerald-100 bg-white text-neutral-900",
    bubble: "bg-emerald-50 text-emerald-600",
  };
}

function groupByDay(movements: InventoryMovement[]) {
  return movements.reduce<Record<string, InventoryMovement[]>>((acc, movement) => {
    const key = movement.createdAt.slice(0, 10);
    acc[key] = [...(acc[key] ?? []), movement];
    return acc;
  }, {});
}

export function InventoryMovementFeed({ movements }: { movements: InventoryMovement[] }) {
  const groups = Object.entries(groupByDay(movements)).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="space-y-4">
      {groups.map(([dateISO, items]) => (
        <div key={dateISO} className="space-y-3">
          <DateSeparator dateISO={dateISO} />

          {items.map((movement) => {
            const meta = movementMeta(movement.type);
            const Icon = meta.icon;
            const isAlert =
              movement.type === "LOW_STOCK_ALERT" || movement.type === "OUT_OF_STOCK_ALERT";

            return (
              <article
                key={movement.id}
                className={`rounded-2xl rounded-tl-none border p-4 shadow-sm ${meta.className}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bubble}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-neutral-900">
                          {movement.itemName}
                        </p>
                        <p className="mt-1 text-[11px] font-medium leading-snug text-neutral-500">
                          {movement.detail}
                        </p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.bubble}`}>
                        {meta.label}
                      </span>
                    </div>

                    {!isAlert && (
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                        <div>
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Impacto</p>
                          <p className={`mt-1 font-black ${movement.quantityImpact < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {movement.quantityImpact > 0 ? "+" : ""}
                            {movement.quantityImpact}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Saldo</p>
                          <p className="mt-1 font-black text-neutral-800">{movement.balance}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Valor</p>
                          <p className="mt-1 font-black text-neutral-800">
                            ${formatMoney(movement.totalValue ?? 0)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
}
