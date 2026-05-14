"use client";

import { ChevronRight, PackageSearch } from "lucide-react";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";

type Props = {
  ingredients: InventorySummaryIngredient[];
  onSelect: (ingredientId: string) => void;
  layout?: "list" | "chat";
};

export function IngredientList({ ingredients, onSelect, layout = "list" }: Props) {
  if (!ingredients.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-50 text-neutral-300">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-sm font-bold text-neutral-900">Sin ingredientes</h3>
        <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-neutral-400">
          Crea tu primer ingrediente para ver stock, costo promedio y valor.
        </p>
      </div>
    );
  }

  return (
    <div className={layout === "chat" ? "flex flex-col-reverse gap-3" : "space-y-3"}>
      {ingredients.map((it) => {
        const currentStock = parseNumber(it.currentStock);
        const averageCost = parseNumber(it.averageCost);
        const stockValue = parseNumber(it.stockValue);
        const inactive = it.status !== "ACTIVE";
        const outOfStock = Number.isFinite(currentStock) && currentStock <= 0;
        const statusBadge = inactive
          ? { label: "Inactivo", tone: "bg-neutral-100 text-neutral-600" }
          : outOfStock
            ? { label: "Sin stock", tone: "bg-rose-50 text-rose-700" }
            : { label: "OK", tone: "bg-emerald-50 text-emerald-800" };
        const avatarLabel = (it.name ?? "I").trim().slice(0, 1).toUpperCase();

        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black text-neutral-700">
                {avatarLabel}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-neutral-900">{it.name}</p>
                    <p className="mt-1 text-[11px] font-medium text-neutral-400">
                      {formatMoney(currentStock)} {it.consumptionUnit} &middot; ${formatMoney(averageCost)} /{" "}
                      {it.consumptionUnit}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusBadge.tone}`}
                    >
                      {statusBadge.label}
                    </span>
                    <div className="mt-2 flex items-center justify-end gap-1 text-[10px] font-bold text-neutral-400">
                      <span>${formatMoney(stockValue)}</span>
                      <ChevronRight className="h-4 w-4 text-neutral-300" />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                  <div>
                    <p className="font-bold uppercase tracking-widest text-neutral-400">Stock</p>
                    <p className="mt-1 font-black text-neutral-800">{formatMoney(currentStock)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold uppercase tracking-widest text-neutral-400">Valor</p>
                    <p className="mt-1 font-black text-neutral-800">${formatMoney(stockValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

