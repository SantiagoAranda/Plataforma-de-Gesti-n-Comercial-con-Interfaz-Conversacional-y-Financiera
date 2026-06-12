"use client";

import { PackageSearch, TriangleAlert } from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { SimpleItemInventorySummary } from "@/src/services/inventory";

type Props = {
  products: SimpleItemInventorySummary[];
  onSelect: (itemId: string) => void;
};

function statusBadge(product: SimpleItemInventorySummary) {
  const status = product.sellability?.status;
  if (status === "MISSING_INITIAL_STOCK") return { label: "Sin inventario inicial", tone: "bg-rose-600 text-white", warning: true };
  if (status === "NO_STOCK" || product.outOfStock) return { label: "Sin stock", tone: "bg-rose-600 text-white", warning: true };
  if (status === "LOW_STOCK") return { label: "Stock bajo", tone: "bg-amber-50 text-amber-800", warning: true };
  return { label: "Listo para vender", tone: "bg-emerald-50 text-emerald-800", warning: false };
}

export function SimpleProductList({ products, onSelect }: Props) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-50 text-neutral-300">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-neutral-900">Sin productos simples</h3>
        <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-neutral-400">
          Los productos con inventario simple aparecerán acá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((product) => {
        const currentStock = parseNumber(product.currentStock);
        const averageCost = parseNumber(product.averageCost);
        const stockValue = parseNumber(product.stockValue);
        const badge = statusBadge(product);

        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product.id)}
            className={`w-full rounded-2xl p-3 text-left shadow-sm ring-1 transition active:scale-[0.99] ${badge.warning ? "bg-rose-50/70 ring-rose-100" : "bg-white ring-black/5"}`}
          >
            <div className="flex gap-3">
              <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-sm font-semibold text-neutral-700 ring-1 ring-black/5">
                {(product.name ?? "P").trim().slice(0, 1).toUpperCase()}
                {badge.warning ? (
                  <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-sm">
                    <TriangleAlert className="h-4 w-4" />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 line-clamp-2 text-sm font-semibold text-neutral-950">{product.name}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${badge.tone}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
                  <p>Stock: <span className="font-semibold text-neutral-900">{formatMoney(currentStock)} unidades</span></p>
                  <p>Costo prom.: <span className="font-semibold text-neutral-900">${formatMoney(averageCost)}</span></p>
                  <p>Valor: <span className="font-semibold text-neutral-900">${formatMoney(stockValue)}</span></p>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
