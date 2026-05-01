"use client";

import { cn } from "@/src/lib/utils";
import type { ComposedProduct } from "./types";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "./inventoryUtils";

type Props = {
  product: ComposedProduct;
  selected?: boolean;
  onClick: () => void;
};

export function ProductInventoryFeedItem({ product, selected, onClick }: Props) {
  const formatValue = (val?: number | string) => {
    if (val === undefined || val === null) return null;
    const num = parseNumber(String(val));
    return Number.isFinite(num) ? num : null;
  };

  const stock = formatValue(product.stock);
  const value = formatValue(product.value);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3xl p-4 text-left shadow-sm transition active:scale-[0.99] border",
        selected
          ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300"
          : "bg-white border-slate-200 ring-0 hover:bg-slate-50",
      )}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-bold text-neutral-900",
            )}
          >
            {product.itemName}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                selected
                  ? "bg-emerald-200/50 text-emerald-800"
                  : "bg-neutral-100 text-neutral-500",
              )}
            >
              {product.inventoryMode}
            </span>
          </div>
        </div>

        {(stock !== null || value !== null) && (
          <div className="shrink-0 text-right">
            {stock !== null && (
              <p className="text-xs font-bold text-emerald-600">
                Stock: {stock}
              </p>
            )}
            {value !== null && (
              <p className="text-[10px] font-medium text-neutral-400">
                ${formatMoney(value)}
              </p>
            )}
          </div>
        )}
      </div>

      {product.ingredients.length > 0 && (
        <div
          className={cn(
            "mt-1 rounded-2xl p-2",
            selected ? "bg-white/60" : "bg-neutral-50",
          )}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Ingredientes ({product.ingredients.length})
          </p>
          <div className="space-y-1">
            {product.ingredients.slice(0, 3).map((ing) => (
              <div
                key={ing.ingredientId}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-neutral-600">
                  {ing.name}
                  {ing.isOptional && " (Opc)"}
                </span>
                <span className="shrink-0 font-medium text-neutral-500">
                  {ing.quantityRequired} {ing.consumptionUnit}
                </span>
              </div>
            ))}
            {product.ingredients.length > 3 && (
              <p className="text-[10px] font-medium text-neutral-400">
                +{product.ingredients.length - 3} más
              </p>
            )}
          </div>
        </div>
      )}

      {product.ingredients.length === 0 && (
        <p className="mt-1 text-[11px] font-medium text-neutral-400">
          Sin receta configurada
        </p>
      )}
    </button>
  );
}
