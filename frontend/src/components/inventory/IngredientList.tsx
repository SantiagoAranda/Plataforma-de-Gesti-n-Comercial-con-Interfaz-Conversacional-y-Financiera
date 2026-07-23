"use client";

import { AlertCircle, AlertTriangle, CheckCircle, HelpCircle, PackageSearch } from "lucide-react";

import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { InventorySummaryIngredient } from "@/src/services/inventory";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { cn } from "@/src/lib/utils";

type Props = {
  ingredients: InventorySummaryIngredient[];
  onSelect: (ingredientId: string) => void;
  onReactivate?: (ingredientId: string) => void;
  layout?: "list" | "chat";
};

export function IngredientList({ ingredients, onSelect, onReactivate, layout = "list" }: Props) {
  if (!ingredients.length) {
    return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"><div className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400"><PackageSearch className="h-7 w-7" /></div><h3 className="mt-4 text-sm font-medium text-slate-800">Sin ingredientes</h3><p className="mt-1 max-w-xs text-xs font-normal leading-relaxed text-slate-400">Crea tu primer insumo para ver stock, costo promedio y valor.</p></div>;
  }

  return <div className={layout === "chat" ? "flex flex-col-reverse gap-3.5" : "space-y-3.5"}>
    {ingredients.map((ingredient) => {
      const inactive = ingredient.status !== "ACTIVE";
      const outOfStock = Boolean(ingredient.outOfStock);
      const lowStock = Boolean(ingredient.lowStock);
      const accent = inactive ? "border-t-slate-300" : outOfStock ? "border-t-rose-500" : lowStock ? "border-t-amber-500" : "border-t-[#0b3f64]";
      const StatusIcon = inactive ? HelpCircle : outOfStock ? AlertCircle : lowStock ? AlertTriangle : CheckCircle;
      const iconTone = inactive ? "text-slate-400" : outOfStock ? "text-rose-500" : lowStock ? "text-amber-500" : "text-emerald-500";
      const avatar = (ingredient.name ?? "I").trim().slice(0, 1).toUpperCase();
      const unit = getStockUnitSymbol(ingredient);

      return <article key={ingredient.id} className={cn("w-full overflow-hidden rounded-xl border border-slate-200 border-t-4 bg-white shadow-xs transition hover:shadow-sm", accent)}>
        <button type="button" onClick={() => onSelect(ingredient.id)} className="w-full p-3 text-left transition active:scale-[0.99] sm:p-4">
          <div className="flex gap-3">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600 shadow-inner">
              {avatar}
              <div className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm"><StatusIcon className={cn("h-3.5 w-3.5", iconTone)} /></div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={cn("truncate text-sm font-medium text-black", inactive && "text-black/50 line-through")}>{ingredient.name}</h3>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:gap-2">
                <Metric tone="blue" label="Stock" value={`${formatQuantityCompact(ingredient.currentStock)} ${unit}`} />
                <Metric tone="red" label="Costo prom." value={`$${formatMoney(parseNumber(ingredient.averageCost))}`} />
                <Metric tone="green" label="Mínimo" value={`${formatQuantityCompact(ingredient.minStock)} ${unit}`} />
              </div>
            </div>
          </div>
        </button>
        {inactive && onReactivate && <div className="px-3 pb-3 sm:px-4 sm:pb-4"><button type="button" onClick={() => onReactivate(ingredient.id)} className="min-h-10 w-full rounded-lg bg-[#0b3f64] text-xs font-medium text-white transition hover:opacity-90">Reactivar insumo</button></div>}
      </article>;
    })}
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "red" | "green" }) {
  const toneClasses = {
    blue: "border-[#0b3f64]/30 bg-[rgba(11,63,100,0.08)]",
    red: "border-[#ff0041]/30 bg-[rgba(255,0,65,0.08)]",
    green: "border-[#00963d]/30 bg-[rgba(0,150,61,0.08)]",
  } as const;

  return <div className={cn("min-w-0 overflow-hidden rounded-xl border px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5", toneClasses[tone])}><span className="block min-h-[1.25rem] truncate text-[8px] font-medium uppercase tracking-wider text-black leading-tight sm:text-[9px]">{label}</span><span className="mt-0.5 block truncate whitespace-nowrap text-xs font-medium tracking-tight text-black tabular-nums sm:text-sm">{value}</span></div>;
}
