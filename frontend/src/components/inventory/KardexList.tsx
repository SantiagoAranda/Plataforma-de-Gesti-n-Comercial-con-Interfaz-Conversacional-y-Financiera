"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  ShoppingBag,
  Warehouse,
  Clock,
  User,
} from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import type { InventoryMovement } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { DateSeparator } from "@/src/components/shared/DateSeparator";
import { cn } from "@/src/lib/utils";

function movementMeta(type: InventoryMovement["type"]) {
  switch (type) {
    case "SALE":
      return { label: "Venta", icon: ShoppingBag };
    case "SALE_RETURN":
      return { label: "Dev. venta", icon: RotateCcw };
    case "PURCHASE":
      return { label: "Compra", icon: ArrowDownLeft };
    case "INVENTORY_INITIAL":
      return { label: "Carga Inicial", icon: Warehouse };
    case "ADJUSTMENT_POSITIVE":
      return { label: "Ajuste (+)", icon: ArrowDownLeft };
    case "ADJUSTMENT_NEGATIVE":
      return { label: "Ajuste (-)", icon: ArrowUpRight };
    case "PURCHASE_RETURN":
      return { label: "Dev. compra", icon: RotateCcw };
    default:
      return { label: type, icon: Clock };
  }
}

function purchaseModeBadge(mode: InventoryMovement["purchaseMode"]) {
  if (mode === "STANDARD") return { label: "Estándar", class: "bg-slate-100 text-slate-700" };
  if (mode === "PRESENTATION") return { label: "Presentación", class: "bg-indigo-50 text-indigo-700 border border-indigo-100" };
  return { label: "Legacy", class: "bg-sky-50 text-sky-700 border border-sky-100" };
}

export function KardexList({
  movements,
  layout = "list",
  stockUnitLabel = "",
}: {
  movements: InventoryMovement[];
  layout?: "list" | "chat";
  stockUnitLabel?: string;
}) {
  if (!movements.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-slate-400 font-medium">
        No hay movimientos de Kardex registrados para este insumo.
      </div>
    );
  }

  // Sort: chronological for standard list view, reverse for chat/bottom timeline view
  const ordered =
    layout === "chat"
      ? [...movements].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      : [...movements].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200/60">
      {ordered.map((m, idx) => {
        const meta = movementMeta(m.type);
        const Icon = meta.icon;
        const qty = parseNumber(m.quantity);
        const unitCost = parseNumber(m.unitCost);
        const totalValue = parseNumber(m.totalValue);
        const stockAfter = parseNumber(m.stockAfter);
        const avgAfter = parseNumber(m.averageCostAfter);

        const dayKey = m.occurredAt.slice(0, 10);
        const prevDayKey = idx > 0 ? ordered[idx - 1].occurredAt.slice(0, 10) : null;
        const showSeparator = dayKey !== prevDayKey;

        const isOutput = ["SALE", "ADJUSTMENT_NEGATIVE", "PURCHASE_RETURN"].includes(m.type);
        const isLegacy = m.purchaseMode === "LEGACY" || !m.purchaseMode;

        // Choose color palette based on input vs output vs legacy status
        let theme = {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-100/50",
          bulletBg: "bg-emerald-500 ring-emerald-100",
          text: "text-emerald-700",
          lineSymbol: "+",
        };

        if (isLegacy) {
          theme = {
            bg: "bg-sky-50 text-sky-700 border-sky-150",
            bulletBg: "bg-sky-500 ring-sky-100",
            text: "text-sky-700",
            lineSymbol: isOutput ? "-" : "+",
          };
        } else if (isOutput) {
          theme = {
            bg: "bg-rose-50 text-rose-700 border-rose-100/50",
            bulletBg: "bg-rose-500 ring-rose-100",
            text: "text-rose-700",
            lineSymbol: "-",
          };
        }

        const modeInfo = purchaseModeBadge(m.purchaseMode);

        return (
          <div key={m.id} className="relative group">
            {/* Timeline point indicator */}
            <div className={cn(
              "absolute -left-[23px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white shadow-sm transition",
              theme.bulletBg
            )}>
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>

            {showSeparator && (
              <div className="mb-2 -ml-6">
                <DateSeparator dateISO={dayKey} />
              </div>
            )}

            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition duration-200 hover:shadow-md">
              <div className="flex flex-col gap-3">
                
                {/* Header info */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", theme.bg)}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {meta.label}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", modeInfo.class)}>
                      {modeInfo.label}
                    </span>
                  </div>

                  <span className="text-[10px] font-bold text-slate-400">
                    {new Date(m.occurredAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Details / description */}
                {m.detail && (
                  <p className="text-xs font-medium text-slate-600 leading-snug">
                    {m.detail}
                  </p>
                )}

                {/* Conversion specific detail */}
                {m.type === "PURCHASE" && m.conversionDetail && (
                  <div className="rounded-xl bg-slate-50 p-2.5 text-[10px] font-semibold text-slate-500 border border-slate-100/60 leading-relaxed">
                    {m.conversionDetail}
                  </div>
                )}

                {/* Values table grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-slate-50 text-[10px] font-semibold">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">Cantidad</p>
                    <p className={cn("mt-0.5 text-xs font-bold", theme.text)}>
                      {theme.lineSymbol}
                      {formatMoney(qty)} {stockUnitLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">Valor Total</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-800">${formatMoney(totalValue)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">Costo Unitario</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-800">
                      ${formatMoney(unitCost)}
                      {stockUnitLabel ? `/${stockUnitLabel}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400">Stock Remanente</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-800">
                      {formatMoney(stockAfter)} {stockUnitLabel}
                    </p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-50/50 flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Costo Promedio Ponderado</span>
                    <span className="text-xs font-bold text-slate-800">
                      ${formatMoney(avgAfter)}
                      {stockUnitLabel ? `/${stockUnitLabel}` : ""}
                    </span>
                  </div>
                </div>

              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
