"use client";

import { cn } from "@/src/lib/utils";

const palette = {
  positive: "from-emerald-50 to-emerald-100 text-emerald-700",
  negative: "from-rose-50 to-orange-100 text-rose-700",
  neutral: "from-slate-50 to-slate-100 text-slate-700",
  warning: "from-amber-50 to-yellow-100 text-amber-700",
};

type Tone = keyof typeof palette;

export function MovementKpiCard({
  label,
  value,
  tone = "neutral",
  icon,
  helperText,
}: {
  label: string;
  value: number;
  tone?: Tone;
  icon?: React.ReactNode;
  helperText?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-white to-white shadow-sm ring-1 ring-black/5 px-4 py-3">
      <div className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br shadow-inner", palette[tone])}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="text-lg font-semibold text-neutral-900">
          {value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
        </div>
        {helperText ? <div className="text-[11px] text-neutral-500">{helperText}</div> : null}
      </div>
    </div>
  );
}
