"use client";

import { BookOpen, PackageSearch, PencilLine, Plus } from "lucide-react";

import { cn } from "@/src/lib/utils";

type Action = {
  key: string;
  label: string;
  hint: string;
  icon: typeof Plus;
  tone: string;
  onClick?: () => void;
};

export function InventoryQuickActions({
  onLoadStock,
  onAdjustStock,
  onNewRecipe,
  onViewKardex,
}: {
  onLoadStock?: () => void;
  onAdjustStock?: () => void;
  onNewRecipe?: () => void;
  onViewKardex?: () => void;
}) {
  const actions: Action[] = [
    {
      key: "load",
      label: "Cargar stock",
      hint: "Entrada",
      icon: Plus,
      tone: "bg-emerald-50 text-emerald-700",
      onClick: onLoadStock,
    },
    {
      key: "adjust",
      label: "Ajustar stock",
      hint: "Corrección",
      icon: PencilLine,
      tone: "bg-sky-50 text-sky-700",
      onClick: onAdjustStock,
    },
    {
      key: "recipe",
      label: "Nueva receta",
      hint: "Producto",
      icon: BookOpen,
      tone: "bg-amber-50 text-amber-800",
      onClick: onNewRecipe,
    },
    {
      key: "kardex",
      label: "Ver kardex",
      hint: "Historial",
      icon: PackageSearch,
      tone: "bg-neutral-100 text-neutral-700",
      onClick: onViewKardex,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className={cn(
              "group flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]",
              !action.onClick && "opacity-70",
            )}
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-neutral-900">{action.label}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-neutral-400">{action.hint}</span>
            </span>
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", action.tone)}>
              <Icon className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
