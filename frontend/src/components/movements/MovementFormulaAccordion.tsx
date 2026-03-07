"use client";

import { useState } from "react";
import type { CompositionFormula } from "@/src/types/movements-ui";
import { cn } from "@/src/lib/utils";

function formatARS(v: number) {
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function formatPct(p?: number) {
  if (!Number.isFinite(p ?? 0)) return "0%";
  return `${(p ?? 0).toFixed(2)}%`;
}

export function MovementFormulaAccordion({ formulas }: { formulas: CompositionFormula[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Composición</div>
      <div className="text-lg font-semibold text-neutral-900">De dónde sale el resultado</div>

      <div className="space-y-2">
        {formulas.map((f) => {
          const isOpen = openKey === f.key;
          return (
            <div key={f.key} className="rounded-2xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center justify-between text-left"
                onClick={() => setOpenKey(isOpen ? null : f.key)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 truncate">{f.title}</div>
                  <div className="text-xs text-neutral-500 truncate">{f.expression}</div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-sm font-bold text-neutral-900">{formatARS(f.resultValue)}</div>
                  <div className="text-[11px] text-neutral-500">{formatPct(f.resultPercentage)}</div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-neutral-100 px-4 py-3 space-y-2 bg-neutral-50/60">
                  {f.items.map((it, idx) => (
                    <div key={`${f.key}-${idx}`} className="flex items-center justify-between text-sm text-neutral-800">
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
                        <div className="text-[11px] text-neutral-500">{formatPct(it.percentage)}</div>
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
