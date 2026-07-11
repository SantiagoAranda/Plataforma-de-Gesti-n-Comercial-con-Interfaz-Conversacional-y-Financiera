"use client";

import { PackageSearch, AlertCircle, AlertTriangle, CheckCircle, Package } from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { SimpleItemInventorySummary } from "@/src/services/inventory";
import { cn } from "@/src/lib/utils";

type Props = {
  products: SimpleItemInventorySummary[];
  onSelect: (itemId: string) => void;
};

function statusBadge(product: SimpleItemInventorySummary) {
  const status = product.sellability?.status;
  if (status === "MISSING_INITIAL_STOCK") {
    return {
      label: "Sin inv. inicial",
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-100",
      icon: AlertCircle,
      iconClass: "text-rose-500",
    };
  }
  if (status === "NO_STOCK" || product.outOfStock) {
    return {
      label: "Sin stock",
      badgeClass: "bg-rose-50 text-rose-700 border border-rose-100",
      icon: AlertCircle,
      iconClass: "text-rose-500",
    };
  }
  if (status === "LOW_STOCK") {
    return {
      label: "Stock bajo",
      badgeClass: "bg-amber-50 text-amber-700 border border-amber-100",
      icon: AlertTriangle,
      iconClass: "text-amber-500",
    };
  }
  return {
    label: "Listo para vender",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    icon: CheckCircle,
    iconClass: "text-emerald-500",
  };
}

export function SimpleProductList({ products, onSelect }: Props) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-sm font-bold text-slate-800">Sin productos simples</h3>
        <p className="mt-1 max-w-xs text-xs font-semibold leading-relaxed text-slate-400">
          Los productos con inventario simple aparecerán acá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {products.map((product) => {
        const currentStock = parseNumber(product.currentStock);
        const averageCost = parseNumber(product.averageCost);
        const stockValue = parseNumber(product.stockValue);
        const badge = statusBadge(product);
        const avatar = (product.name ?? "P").trim().slice(0, 1).toUpperCase();
        const StatusIcon = badge.icon;

        return (
          <article
            key={product.id}
            className="w-full rounded-2xl border-t-4 border-t-blue-500 border-b border-r border-l border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition duration-200 hover:shadow-md overflow-hidden font-sans"
          >
            <button
              type="button"
              onClick={() => onSelect(product.id)}
              className="w-full text-left p-4 transition active:scale-[0.99] font-sans"
            >
              <div className="flex gap-4">
                {/* Visual indicator / avatar */}
                <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 text-sm font-extrabold text-slate-600 border border-slate-100 shadow-inner">
                  {avatar}
                  <div className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm">
                    <StatusIcon className={cn("h-3.5 w-3.5", badge.iconClass)} />
                  </div>
                </div>

                {/* Information content */}
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 line-clamp-1 text-sm font-semibold text-black tracking-tight leading-tight">
                      {product.name}
                    </h3>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide", badge.badgeClass)}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-400">
                    <div className="bg-slate-50/50 rounded-xl p-1.5 border border-slate-50 text-center">
                      <span className="block text-[8px] uppercase tracking-wider text-slate-400/80">Stock</span>
                      <span className="text-slate-700 block mt-0.5 truncate text-[11px]">
                        {formatMoney(currentStock)} <span className="text-[9px] font-semibold text-slate-400">u</span>
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
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3 text-slate-350" />
                      Producto Simple
                    </span>
                    <span>Registro directo</span>
                  </div>
                </div>
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}
