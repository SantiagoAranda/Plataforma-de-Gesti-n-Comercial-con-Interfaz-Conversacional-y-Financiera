"use client";

import { Banknote, PackageCheck, TriangleAlert } from "lucide-react";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";

export function InventorySummaryCards({ items }: { items: InventorySummaryIngredient[] }) {
  const totalValue = items.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
  const totalStock = items.reduce((acc, it) => acc + parseNumber(it.currentStock), 0);
  const weightedAvgCost = totalStock > 0 ? totalValue / totalStock : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700">
          <PackageCheck className="h-4 w-4" />
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          Valor inventario
        </p>
        <p className="mt-1 text-lg font-black text-neutral-900">${formatMoney(totalValue)}</p>
        <p className="mt-1 text-[11px] font-medium text-neutral-400">
          Stock total: {formatMoney(totalStock)}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Banknote className="h-4 w-4" />
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          Costo prom. (pond.)
        </p>
        <p className="mt-1 text-lg font-black text-neutral-900">${formatMoney(weightedAvgCost)}</p>
        <p className="mt-1 text-[11px] font-medium text-neutral-400">Promedio ponderado por stock</p>
      </div>

      <div className="col-span-2 rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-700">
            <TriangleAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-neutral-900">Alertas de stock bajo</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-400">
              Placeholder: la API actual no expone umbrales de stock m&iacute;nimo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

