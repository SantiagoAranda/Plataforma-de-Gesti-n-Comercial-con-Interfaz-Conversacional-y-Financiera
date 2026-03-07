"use client";

import type { MovementPeriodKey } from "@/src/types/movements-ui";

const OPTIONS: { key: MovementPeriodKey; label: string }[] = [
  { key: "THIS_MONTH", label: "Este mes" },
  { key: "LAST_30_DAYS", label: "Últimos 30 días" },
  { key: "PREVIOUS_MONTH", label: "Mes anterior" },
];

export function MovementPeriodFilter({
  value,
  onChange,
}: {
  value: MovementPeriodKey;
  onChange: (v: MovementPeriodKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-neutral-700 border border-neutral-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
