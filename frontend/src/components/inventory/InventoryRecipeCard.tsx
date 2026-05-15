"use client";

import { MoreVertical, PencilLine, PackageSearch } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";

export function InventoryRecipeCard({
  name,
  price,
  estimatedCost,
  ingredientsCount,
  impactText,
  imageUrl,
  active = true,
  onEditRecipe,
  onViewKardex,
  onMenu,
}: {
  name: string;
  price?: number | null;
  estimatedCost?: number | null;
  ingredientsCount?: number | null;
  impactText?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  onEditRecipe?: () => void;
  onViewKardex?: () => void;
  onMenu?: () => void;
}) {
  return (
    <article className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start gap-4">
        <div className="h-[72px] w-[96px] shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-[size:14px_14px]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-neutral-900">{name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                    active ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-600",
                  )}
                >
                  {active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onMenu}
              className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95"
              aria-label="Men&uacute;"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-1 text-[11px] font-medium text-neutral-600">
            {price !== undefined && price !== null && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Precio:</span>
                <span className="font-black text-neutral-800">${formatMoney(price)} COP</span>
              </div>
            )}
            {estimatedCost !== undefined && estimatedCost !== null && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Costo estimado:</span>
                <span className="font-black text-neutral-800">${formatMoney(estimatedCost)} COP</span>
              </div>
            )}
            {ingredientsCount !== undefined && ingredientsCount !== null && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">Ingredientes:</span>
                <span className="font-black text-neutral-800">{ingredientsCount}</span>
              </div>
            )}
            {impactText && (
              <div className="flex items-start gap-2">
                <span className="text-neutral-400">Stock impacto:</span>
                <span className="line-clamp-2 font-black text-neutral-800">{impactText}</span>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onEditRecipe}
              className="h-11 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <PencilLine className="h-4 w-4 text-neutral-600" />
                Editar receta
              </span>
            </button>
            <button
              type="button"
              onClick={onViewKardex}
              className="h-11 rounded-2xl bg-emerald-500 text-xs font-black text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <PackageSearch className="h-4 w-4" />
                Ver kardex
              </span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

