"use client";

import { cn } from "@/src/lib/utils";
import type { MovementMetricLine } from "@/src/types/movements-ui";

export function MovementBreakdownList({ items }: { items: MovementMetricLine[] }) {
  const toneColor = (tone?: MovementMetricLine["tone"]) => {
    if (tone === "positive") return "text-emerald-700";
    if (tone === "negative") return "text-rose-700";
    if (tone === "warning") return "text-amber-700";
    return "text-neutral-800";
  };

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold text-neutral-900">Resumen del período</div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm"
          >
            <span className="text-sm font-semibold text-neutral-600 truncate">{item.label}</span>
            <span className={cn("text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis text-right", toneColor(item.tone))}>
              {item.value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
