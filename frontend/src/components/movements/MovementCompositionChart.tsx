"use client";

import { cn } from "@/src/lib/utils";

type Item = {
  label: string;
  value: number;
  tone: "green" | "red" | "blue" | "amber";
};

const colors: Record<Item["tone"], string> = {
  green: "bg-emerald-500",
  red: "bg-rose-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
};

export function MovementCompositionChart({ items }: { items: Item[] }) {
  const total = Math.max(
    1,
    items.reduce((s, i) => (i.value > 0 ? s + i.value : s), 0),
  );

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Composición</div>
      <div className="text-lg font-semibold text-neutral-900">De dónde sale el resultado</div>

      <div className="space-y-3">
        {items.map((item) => {
          const pctRaw = (Math.abs(item.value) / total) * 100;
          const pct = Math.min(100, Math.max(4, Math.round(pctRaw)));
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-600 gap-2">
                <span className="truncate">{item.label}</span>
                <span className="font-semibold text-neutral-800 whitespace-nowrap overflow-hidden text-ellipsis">
                  {item.value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-neutral-100">
                <div className={cn("h-full rounded-full", colors[item.tone])} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
