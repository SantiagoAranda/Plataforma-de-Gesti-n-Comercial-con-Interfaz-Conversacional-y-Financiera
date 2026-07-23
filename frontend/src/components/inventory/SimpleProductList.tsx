"use client";

import { AlertCircle, AlertTriangle, CheckCircle, PackageSearch } from "lucide-react";

import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import type { SimpleItemInventorySummary } from "@/src/services/inventory";
import { cn } from "@/src/lib/utils";

type Props = { products: SimpleItemInventorySummary[]; onSelect: (itemId: string) => void; };

function stockIcon(product: SimpleItemInventorySummary) {
  const status = product.sellability?.status;
  if (status === "MISSING_INITIAL_STOCK" || status === "NO_STOCK" || product.outOfStock) return { Icon: AlertCircle, tone: "text-rose-500", accent: "border-t-rose-500" };
  if (status === "LOW_STOCK") return { Icon: AlertTriangle, tone: "text-amber-500", accent: "border-t-amber-500" };
  return { Icon: CheckCircle, tone: "text-emerald-500", accent: "border-t-[#0b3f64]" };
}

export function SimpleProductList({ products, onSelect }: Props) {
  if (!products.length) {
    return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center"><div className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400"><PackageSearch className="h-7 w-7" /></div><h3 className="mt-4 text-sm font-medium text-slate-800">Sin productos simples</h3><p className="mt-1 max-w-xs text-xs font-normal leading-relaxed text-slate-400">Los productos con inventario simple aparecerán acá.</p></div>;
  }

  return <div className="space-y-3.5">
    {products.map((product) => {
      const { Icon, tone, accent } = stockIcon(product);
      const avatar = (product.name ?? "P").trim().slice(0, 1).toUpperCase();
      return <article key={product.id} className={cn("w-full overflow-hidden rounded-xl border border-slate-200 border-t-4 bg-white shadow-xs transition hover:shadow-sm", accent)}>
        <button type="button" onClick={() => onSelect(product.id)} className="w-full p-3 text-left transition active:scale-[0.99] sm:p-4">
          <div className="flex gap-3">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600 shadow-inner">
              {avatar}
              <div className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm"><Icon className={cn("h-3.5 w-3.5", tone)} /></div>
            </div>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-black">{product.name}</h3><div className="mt-2.5 grid grid-cols-3 gap-1.5 sm:gap-2"><Metric tone="blue" label="Stock" value={`${formatQuantityCompact(product.currentStock)} u`} /><Metric tone="red" label="Costo prom." value={`$${formatMoney(parseNumber(product.averageCost))}`} /><Metric tone="green" label="Precio" value={`$${formatMoney(parseNumber(product.price))}`} /></div></div>
          </div>
        </button>
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
