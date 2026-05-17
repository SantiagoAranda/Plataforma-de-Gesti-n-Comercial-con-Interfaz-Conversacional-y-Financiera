"use client";

import { PackageSearch } from "lucide-react";

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

  const formatShortDate = (dateISO: string | null | undefined) => {
    if (!dateISO) return "—";
    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  return (
    <div className={layout === "chat" ? "flex flex-col-reverse gap-3" : "space-y-3"}>
      {ingredients.map((it) => {
        const currentStock = parseNumber(it.currentStock);
        const averageCost = parseNumber(it.averageCost);
        const stockValue = parseNumber(it.stockValue);
        const inactive = it.status !== "ACTIVE";
        const outOfStock = Number.isFinite(currentStock) && currentStock <= 0;
        const minStock = parseNumber((it as any).minStock ?? 0);
        const lowStock =
          it.lowStock !== undefined
            ? it.lowStock
            : Number.isFinite(minStock) && minStock > 0 && Number.isFinite(currentStock) && currentStock > 0 && currentStock <= minStock;
        const statusBadge = inactive
          ? { label: "Inactivo", tone: "bg-neutral-100 text-neutral-600" }
          : outOfStock
            ? { label: "Sin stock", tone: "bg-rose-50 text-rose-700" }
            : lowStock
              ? { label: "Stock bajo", tone: "bg-amber-50 text-amber-800" }
            : { label: "OK", tone: "bg-emerald-50 text-emerald-800" };

        const lastMovementText = "Últ. mov.: —";
        const lastDate = formatShortDate((it as any).updatedAt ?? (it as any).createdAt ?? null);

        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className="w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
          >
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5" />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 line-clamp-2 text-sm font-black text-neutral-950">{it.name}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusBadge.tone}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
                  <p>
                    Valor:{" "}
                    <span className="font-black text-neutral-900">${formatMoney(stockValue)}</span>
                  </p>
                  <p>
                    Costo prom.:{" "}
                    <span className="font-black text-neutral-900">
                      ${formatMoney(averageCost)} / {it.consumptionUnit}
                    </span>
                  </p>
                  <p>
                    Stock:{" "}
                    <span className="font-black text-neutral-900">
                      {formatMoney(currentStock)} {it.consumptionUnit}
                    </span>
                  </p>
                </div>

                <div className="mt-2 flex items-end justify-between gap-2 border-t border-neutral-100 pt-2">
                  <p className="min-w-0 truncate text-[11px] font-medium text-neutral-500">{lastMovementText}</p>
                  <time className="shrink-0 text-[10px] font-semibold text-neutral-400">{lastDate}</time>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

