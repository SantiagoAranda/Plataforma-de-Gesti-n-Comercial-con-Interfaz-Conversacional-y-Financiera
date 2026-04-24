"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  ShoppingBag,
  Warehouse,
} from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import type { InventoryMovement } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { DateSeparator } from "@/src/components/shared/DateSeparator";

function movementMeta(type: InventoryMovement["type"]) {
  if (type === "SALE") {
    return { label: "Venta", icon: ShoppingBag, bubble: "bg-rose-50 text-rose-600", border: "border-rose-100" };
  }
  if (type === "SALE_RETURN") {
    return { label: "Dev. venta", icon: RotateCcw, bubble: "bg-sky-50 text-sky-700", border: "border-sky-100" };
  }
  if (type === "PURCHASE") {
    return { label: "Compra", icon: ArrowDownLeft, bubble: "bg-emerald-50 text-emerald-700", border: "border-emerald-100" };
  }
  if (type === "INVENTORY_INITIAL") {
    return { label: "Inicial", icon: Warehouse, bubble: "bg-neutral-100 text-neutral-700", border: "border-neutral-100" };
  }
  if (type === "ADJUSTMENT_POSITIVE") {
    return { label: "Ajuste +", icon: ArrowDownLeft, bubble: "bg-emerald-50 text-emerald-700", border: "border-emerald-100" };
  }
  if (type === "ADJUSTMENT_NEGATIVE") {
    return { label: "Ajuste -", icon: ArrowUpRight, bubble: "bg-rose-50 text-rose-700", border: "border-rose-100" };
  }
  if (type === "PURCHASE_RETURN") {
    return { label: "Dev. compra", icon: RotateCcw, bubble: "bg-amber-50 text-amber-700", border: "border-amber-100" };
  }
  return { label: type, icon: ArrowDownLeft, bubble: "bg-neutral-100 text-neutral-700", border: "border-neutral-100" };
}

function groupByDay(movements: InventoryMovement[]) {
  return movements.reduce<Record<string, InventoryMovement[]>>((acc, movement) => {
    const key = movement.occurredAt.slice(0, 10);
    acc[key] = [...(acc[key] ?? []), movement];
    return acc;
  }, {});
}

export function KardexList({ movements }: { movements: InventoryMovement[] }) {
  if (!movements.length) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
        No hay movimientos para este ingrediente.
      </div>
    );
  }

  const groups = Object.entries(groupByDay(movements)).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="space-y-4">
      {groups.map(([dateISO, items]) => (
        <div key={dateISO} className="space-y-3">
          <DateSeparator dateISO={dateISO} />
          {items.map((m) => {
            const meta = movementMeta(m.type);
            const Icon = meta.icon;
            const qty = parseNumber(m.quantity);
            const unitCost = parseNumber(m.unitCost);
            const totalValue = parseNumber(m.totalValue);
            const stockAfter = parseNumber(m.stockAfter);
            const avgAfter = parseNumber(m.averageCostAfter);

            const isOutput = ["SALE", "ADJUSTMENT_NEGATIVE", "PURCHASE_RETURN"].includes(m.type);

            return (
              <article
                key={m.id}
                className={`rounded-2xl rounded-tl-none border bg-white p-4 shadow-sm ${meta.border}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bubble}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neutral-900">{meta.label}</p>
                        {m.detail && (
                          <p className="mt-1 text-[11px] font-medium leading-snug text-neutral-500">
                            {m.detail}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.bubble}`}>
                        {new Date(m.occurredAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                      <div>
                        <p className="font-bold uppercase tracking-widest text-neutral-400">
                          {isOutput ? "Salida" : "Entrada"}
                        </p>
                        <p className={`mt-1 font-black ${isOutput ? "text-rose-600" : "text-emerald-600"}`}>
                          {isOutput ? "-" : "+"}
                          {formatMoney(qty)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold uppercase tracking-widest text-neutral-400">Valor</p>
                        <p className="mt-1 font-black text-neutral-800">${formatMoney(totalValue)}</p>
                      </div>
                      <div>
                        <p className="font-bold uppercase tracking-widest text-neutral-400">Costo unit.</p>
                        <p className="mt-1 font-black text-neutral-800">${formatMoney(unitCost)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold uppercase tracking-widest text-neutral-400">Stock despu&eacute;s</p>
                        <p className="mt-1 font-black text-neutral-800">{formatMoney(stockAfter)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-bold uppercase tracking-widest text-neutral-400">Costo prom. despu&eacute;s</p>
                        <p className="mt-1 font-black text-neutral-800">${formatMoney(avgAfter)}</p>
                      </div>
                    </div>
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

