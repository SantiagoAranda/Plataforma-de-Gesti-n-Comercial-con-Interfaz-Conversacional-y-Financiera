"use client";

import { PackageSearch, TriangleAlert } from "lucide-react";

import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";
import { formatIngredientUnit } from "@/src/components/inventory/unitLabels";

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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-50 text-neutral-300">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-sm font-medium text-neutral-900">Sin ingredientes</h3>
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
        const unitLabel = formatIngredientUnit(it);
        const inactive = it.status !== "ACTIVE";
        const outOfStock = !!it.outOfStock;
        const lowStock = !!it.lowStock;
        const statusBadge = inactive
          ? { label: "Inactivo", tone: "bg-neutral-100 text-neutral-600" }
          : outOfStock
            ? { label: "Sin stock", tone: "bg-rose-600 text-white" }
            : lowStock
              ? { label: "Stock bajo", tone: "bg-rose-50 text-rose-700" }
            : { label: "OK", tone: "bg-emerald-50 text-emerald-800" };

        const warning = !inactive && (outOfStock || lowStock);
        const cardTone = warning ? "bg-rose-50/80 ring-1 ring-rose-100" : "bg-white ring-1 ring-black/5";
        const avatar = (it.name ?? "I").trim().slice(0, 1).toUpperCase();

        const lastMovementText = "Últ. mov.: —";
        const lastDate = formatShortDate((it as any).updatedAt ?? (it as any).createdAt ?? null);

        return (
          <article
            key={it.id}
            className={`w-full rounded-2xl p-3 text-left shadow-sm ${cardTone}`}
          >
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              className="w-full text-left transition active:scale-[0.99]"
            >
            <div className="flex gap-3">
              <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/70 ring-1 ring-black/5">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">
                  {avatar}
                </div>
                {warning ? (
                  <div className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-rose-600 text-white shadow-md">
                    <TriangleAlert className="h-4 w-4" />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 line-clamp-2 text-sm font-semibold text-neutral-950">{it.name}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${statusBadge.tone}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
                  <p>
                    Valor:{" "}
                    <span className="font-semibold text-neutral-900">${formatMoney(stockValue)}</span>
                  </p>
                  <p>
                    Costo prom.:{" "}
                    <span className="font-semibold text-neutral-900">
                      ${formatMoney(averageCost)} / {unitLabel}
                    </span>
                  </p>
                  <p>
                    Stock:{" "}
                    <span className="font-semibold text-neutral-900">
                      {formatMoney(currentStock)} {unitLabel}
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

            {inactive && onReactivate ? (
              <button
                type="button"
                onClick={() => onReactivate(it.id)}
                className="mt-3 h-10 w-full rounded-2xl bg-neutral-900 text-xs font-semibold text-white shadow-sm transition active:scale-[0.99]"
              >
                Reactivar
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

