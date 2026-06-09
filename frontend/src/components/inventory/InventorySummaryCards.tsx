"use client";

import { Layers, PackageCheck, TriangleAlert } from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";

export function InventorySummaryCards({ items }: { items: InventorySummaryIngredient[] }) {
  const totalValue = items.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
  const totalStock = items.reduce((acc, it) => acc + parseNumber(it.currentStock), 0);

  const outOfStockCount = items.filter((it) =>
    it.outOfStock !== undefined ? it.outOfStock : parseNumber(it.currentStock) <= 0,
  ).length;
  const lowStockCount = items.filter((it) => {
    if (it.lowStock !== undefined) return it.lowStock;
    const minStock = parseNumber((it as any).minStock ?? 0);
    const currentStock = parseNumber(it.currentStock);
    return Number.isFinite(minStock) && minStock > 0 && currentStock > 0 && currentStock <= minStock;
  }).length;
  const alertCount = outOfStockCount + lowStockCount;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor inventario</p>
          <p className="mt-0.5 truncate text-base font-black text-neutral-900">${formatMoney(totalValue)}</p>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-400">Costo total</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700">
          <Layers className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Stock total</p>
          <p className="mt-0.5 truncate text-base font-black text-neutral-900">{formatMoney(totalStock)}</p>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-400">En todos los insumos</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-700">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Alertas</p>
          <p className="mt-0.5 truncate text-base font-black text-neutral-900">{formatMoney(alertCount)}</p>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-400">Insumos cr&iacute;ticos</p>
        </div>
      </div>
    </div>
  );
}

