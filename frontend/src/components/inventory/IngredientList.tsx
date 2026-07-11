"use client";

import { PackageSearch, AlertCircle, AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { cn } from "@/src/lib/utils";

type Props = {
  ingredients: InventorySummaryIngredient[];
  onSelect: (ingredientId: string) => void;
  onReactivate?: (ingredientId: string) => void;
  layout?: "list" | "chat";
};

export function IngredientList({
  ingredients,
  onSelect,
  onReactivate,
  layout = "list",
}: Props) {
  if (!ingredients.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-sm font-bold text-slate-800">Sin ingredientes</h3>
        <p className="mt-1 max-w-xs text-xs font-semibold leading-relaxed text-slate-400">
          Crea tu primer insumo para ver stock, costo promedio y valor.
        </p>
      </div>
    );
  }

  const formatShortDate = (dateISO: string | null | undefined) => {
    if (!dateISO) return "—";
    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " + date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={layout === "chat" ? "flex flex-col-reverse gap-3.5" : "space-y-3.5"}>
      {ingredients.map((it) => {
        const currentStock = parseNumber(it.currentStock);
        const averageCost = parseNumber(it.averageCost);
        const stockValue = parseNumber(it.stockValue);
        const unitLabel = getStockUnitSymbol(it);
        const inactive = it.status !== "ACTIVE";
        const outOfStock = !!it.outOfStock;
        const lowStock = !!it.lowStock;

        // Visual properties based on status
        let statusConfig = {
          label: "OK",
          badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100",
          borderClass: "border-t-emerald-500",
          icon: CheckCircle,
          iconClass: "text-emerald-500",
        };

        if (inactive) {
          statusConfig = {
            label: "Inactivo",
            badgeClass: "bg-slate-100 text-slate-500 border border-slate-200",
            borderClass: "border-t-slate-300",
            icon: HelpCircle,
            iconClass: "text-slate-400",
          };
        } else if (outOfStock) {
          statusConfig = {
            label: "Sin stock",
            badgeClass: "bg-rose-50 text-rose-700 border border-rose-150",
            borderClass: "border-t-rose-500",
            icon: AlertCircle,
            iconClass: "text-rose-500",
          };
        } else if (lowStock) {
          statusConfig = {
            label: "Stock bajo",
            badgeClass: "bg-amber-50 text-amber-700 border border-amber-150",
            borderClass: "border-t-amber-500",
            icon: AlertTriangle,
            iconClass: "text-amber-500",
          };
        }

        const avatar = (it.name ?? "I").trim().slice(0, 1).toUpperCase();
        const lastDate = formatShortDate((it as any).updatedAt ?? (it as any).createdAt ?? null);
        const StatusIcon = statusConfig.icon;

        return (
          <article
            key={it.id}
            className={cn(
              "w-full rounded-2xl border-t-4 border-b border-r border-l border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition duration-200 hover:shadow-md overflow-hidden font-sans",
              statusConfig.borderClass
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              className="w-full text-left p-4 transition active:scale-[0.99] font-sans"
            >
              <div className="flex gap-4">
                {/* Visual indicator / avatar */}
                <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 text-sm font-extrabold text-slate-600 border border-slate-100 shadow-inner">
                  {avatar}
                  <div className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm">
                    <StatusIcon className={cn("h-3.5 w-3.5", statusConfig.iconClass)} />
                  </div>
                </div>

                {/* Information content */}
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 line-clamp-1 text-sm font-semibold text-black tracking-tight leading-tight">
                      {it.name}
                    </h3>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide", statusConfig.badgeClass)}>
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-400">
                    <div className="bg-slate-50/50 rounded-xl p-1.5 border border-slate-50 text-center">
                      <span className="block text-[8px] uppercase tracking-wider text-slate-400/80">Stock</span>
                      <span className="text-slate-700 block mt-0.5 truncate text-[11px]">
                        {formatMoney(currentStock)} <span className="text-[9px] font-semibold text-slate-400">{unitLabel}</span>
                      </span>
                    </div>
                    <div className="bg-slate-50/50 rounded-xl p-1.5 border border-slate-50 text-center">
                      <span className="block text-[8px] uppercase tracking-wider text-slate-400/80">Costo Prom.</span>
                      <span className="text-slate-700 block mt-0.5 truncate text-[11px]">
                        ${formatMoney(averageCost)}
                      </span>
                    </div>
                    <div className="bg-slate-50/50 rounded-xl p-1.5 border border-slate-50 text-center">
                      <span className="block text-[8px] uppercase tracking-wider text-slate-400/80">Valorizado</span>
                      <span className="text-slate-700 block mt-0.5 truncate text-[11px]">
                        ${formatMoney(stockValue)}
                      </span>
                    </div>
                  </div>

                  {/* Footer metadata */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-50/80 pt-2 text-xs font-medium text-neutral-500">
                    <span className="truncate">Último movimiento</span>
                    <time className="shrink-0 text-neutral-500">{lastDate}</time>
                  </div>
                </div>
              </div>
            </button>

            {inactive && onReactivate && (
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => onReactivate(it.id)}
                  className="h-10 w-full rounded-2xl bg-slate-900 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-slate-800"
                >
                  Reactivar Insumo
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
