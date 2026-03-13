"use client";

import type { ReactNode } from "react";
import type { VisibleMetric } from "@/src/types/movements-ui";
import { cn } from "@/src/lib/utils";

function formatARS(v: number) {
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

type MovementSummaryListProps = {
  metrics: VisibleMetric[];
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
};

export function MovementSummaryList({ metrics, headerLeft, headerRight }: MovementSummaryListProps) {
  const hasHeaderControls = Boolean(headerLeft || headerRight);

  return (
    <div className="h-full rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 space-y-2">
      <div className={cn("px-1", hasHeaderControls && "grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2")}>
        {hasHeaderControls && <div className="flex justify-start">{headerLeft}</div>}
        <div className={cn(hasHeaderControls && "text-center")}>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumen del periodo</div>
          <div className="text-lg font-semibold text-neutral-900">Indicadores</div>
        </div>
        {hasHeaderControls && <div className="flex justify-end">{headerRight}</div>}
      </div>

      <div className="space-y-2">
        {metrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm",
              m.highlight && "border-emerald-200 shadow-[0_6px_24px_rgba(16,185,129,0.18)]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-sm font-semibold text-neutral-900">{m.label}</div>
              <div className={cn("shrink-0 text-right text-sm font-bold", m.highlight ? "text-emerald-700" : "text-neutral-900")}>
                {formatARS(m.value)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
