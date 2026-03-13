"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

type Item = {
  key: string;
  label: string;
  value: number;
  percentage: number;
  tone?: "green" | "red" | "blue" | "amber";
};

const colors: Record<NonNullable<Item["tone"]>, string> = {
  green: "bg-emerald-500",
  red: "bg-rose-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
};

function formatPct(p: number) {
  if (!Number.isFinite(p)) return "0%";
  return `${p.toFixed(2)}%`;
}

type MovementPercentBarChartProps = {
  items: Item[];
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
};

export function MovementPercentBarChart({ items, headerLeft, headerRight }: MovementPercentBarChartProps) {
  const maxPct = Math.max(1, ...items.map((i) => Math.abs(i.percentage ?? 0)));
  const hasHeaderControls = Boolean(headerLeft || headerRight);

  return (
    <div className="h-full rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-3">
      <div className={cn(hasHeaderControls && "grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2")}>
        {hasHeaderControls && <div className="flex justify-start">{headerLeft}</div>}
        <div className={cn(hasHeaderControls && "text-center")}>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Porcentajes del periodo</div>
          <div className="text-lg font-semibold text-neutral-900">Como pesa cada indicador</div>
        </div>
        {hasHeaderControls && <div className="flex justify-end">{headerRight}</div>}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const width = Math.max(4, Math.min(100, (Math.abs(item.percentage) / maxPct) * 100));
          const tone = item.tone ?? (item.value >= 0 ? "green" : "red");
          return (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                <span className="truncate">{item.label}</span>
                <span className="whitespace-nowrap overflow-hidden text-ellipsis font-semibold text-neutral-800">
                  {formatPct(item.percentage)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-neutral-100">
                <div className={cn("h-full rounded-full", colors[tone])} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
