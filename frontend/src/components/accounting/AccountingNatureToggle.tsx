"use client";

import type { Nature } from "@/src/types/accounting-form";

type Props = {
  value: Nature;
  onChange: (value: Nature) => void;
};

export function AccountingNatureToggle({ value, onChange }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 text-xs font-semibold text-neutral-600">
        Naturaleza
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange("DEBIT")}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              value === "DEBIT"
                ? "bg-emerald-500 text-white"
                : "bg-white text-neutral-700"
            }`}
          >
            Débito
          </button>

          <button
            type="button"
            onClick={() => onChange("CREDIT")}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              value === "CREDIT"
                ? "bg-emerald-500 text-white"
                : "bg-white text-neutral-700"
            }`}
          >
            Crédito
          </button>
        </div>
      </div>
    </div>
  );
}