"use client";

import { useState } from "react";
import type { VisibleMetric } from "@/src/types/movements-ui";
import { cn } from "@/src/lib/utils";

function formatARS(v: number) {
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function formatPct(p?: number) {
  if (!Number.isFinite(p ?? 0)) return "0%";
  return `${(p ?? 0).toFixed(2)}%`;
}

export function MovementSummaryList({ metrics }: { metrics: VisibleMetric[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 space-y-2">
      <div className="px-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumen del período</div>
        <div className="text-lg font-semibold text-neutral-900">Indicadores</div>
      </div>

      <div className="space-y-2">
        {metrics.map((m) => {
          const isOpen = openKey === m.key;
          return (
            <div
              key={m.key}
              className={cn(
                "rounded-2xl border border-neutral-100 bg-white shadow-sm overflow-hidden",
                m.highlight && "border-emerald-200 shadow-[0_6px_24px_rgba(16,185,129,0.18)]",
              )}
            >
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center justify-between text-left"
                onClick={() => setOpenKey(isOpen ? null : m.key)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 truncate">{m.label}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{formatPct(m.percentage)}</div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className={cn("text-sm font-bold", m.highlight ? "text-emerald-700" : "text-neutral-900")}>
                    {formatARS(m.value)}
                  </div>
                </div>
              </button>

              {isOpen && m.breakdown && (
                <div className="border-t border-neutral-100 bg-neutral-50/70 px-4 py-3 space-y-1">
                  {m.breakdown.expression && (
                    <div className="text-[11px] font-semibold text-neutral-600">{m.breakdown.expression}</div>
                  )}
                  {m.breakdown.items.map((it, idx) => (
                    <div key={`${m.key}-${idx}`} className="flex items-center justify-between text-sm text-neutral-800">
                      <div className="flex items-center gap-2">
                        {it.operator && (
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                              it.operator === "+"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-rose-50 text-rose-700 border border-rose-100",
                            )}
                          >
                            {it.operator}
                          </span>
                        )}
                        <span className="truncate">{it.label}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-neutral-900">{formatARS(it.value)}</div>
                        {Number.isFinite(it.percentage) && (
                          <div className="text-[11px] text-neutral-500">{formatPct(it.percentage)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
