"use client";

import { PackageCheck, Layers, TriangleAlert } from "lucide-react";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";

export function InventorySummaryCards({ items }: { items: InventorySummaryIngredient[] }) {
  const totalValue = items.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
  const totalStock = items.reduce((acc, it) => acc + parseNumber(it.currentStock), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Valor Inventario */}
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Valor Inventario
            </p>
            <p className="mt-0.5 truncate text-base font-black text-neutral-900">
              ${formatMoney(totalValue)}
            </p>
          </div>
        </div>

        {/* Stock Total */}
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Stock Total
            </p>
            <p className="mt-0.5 truncate text-base font-black text-neutral-900">
              {formatMoney(totalStock)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700">
            <TriangleAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-neutral-900">Alertas de stock bajo</p>
            <p className="text-[11px] font-medium leading-relaxed text-neutral-400">
              La API no expone umbrales aún.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

