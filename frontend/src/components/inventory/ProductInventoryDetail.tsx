"use client";

import { cn } from "@/src/lib/utils";
import type { ComposedProduct } from "./types";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "./inventoryUtils";
import { ChevronRight } from "lucide-react";

type Props = {
  product: ComposedProduct | null;
  className?: string;
};

export function ProductInventoryDetail({ product, className }: Props) {
  if (!product) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center p-6 text-center", className)}>
        <div className="rounded-full bg-neutral-100 p-4 text-neutral-400">
          <ChevronRight className="h-8 w-8 opacity-50" />
        </div>
        <p className="mt-4 text-sm font-medium text-neutral-400">
          Seleccioná un producto para ver el detalle
        </p>
      </div>
    );
  }

  const stock = product.stock !== undefined ? parseNumber(String(product.stock)) : null;
  const value = product.value !== undefined ? parseNumber(String(product.value)) : null;

  return (
    <div className={cn("flex h-full flex-col bg-white", className)}>
      <div className="border-b border-neutral-100 p-6">
        <h2 className="text-xl font-black text-neutral-900">{product.itemName}</h2>
        {product.price !== undefined && (
          <p className="mt-1 text-sm font-bold text-neutral-500">
            Precio: ${formatMoney(product.price)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-600">
            {product.itemType}
          </span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-600">
            {product.inventoryMode}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {(stock !== null || value !== null) && (
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-neutral-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Stock
              </p>
              <p className="mt-1 text-lg font-black text-neutral-900">
                {stock !== null && Number.isFinite(stock) ? stock : "N/A"}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Valor
              </p>
              <p className="mt-1 text-lg font-black text-neutral-900">
                {value !== null && Number.isFinite(value) ? `$${formatMoney(value)}` : "N/A"}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-neutral-900">
            Ingredientes
          </h3>

          {product.ingredients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-center text-[11px] font-medium text-neutral-400">
              No hay ingredientes configurados.
            </div>
          ) : (
            <div className="space-y-2">
              {product.ingredients.map((ing) => (
                <div 
                  key={ing.ingredientId} 
                  className="flex flex-col gap-1 rounded-2xl bg-neutral-50 p-3 text-sm shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-neutral-900">{ing.name}</span>
                    <span className="shrink-0 font-medium text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-lg text-xs">
                      {ing.quantityRequired} {ing.consumptionUnit}
                    </span>
                  </div>
                  {(ing.isOptional || ing.currentStock !== undefined) && (
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                      {ing.isOptional && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-bold uppercase tracking-widest text-amber-700">
                          Opcional
                        </span>
                      )}
                      {ing.currentStock !== undefined && (
                        <span>Stock ref: {ing.currentStock}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
