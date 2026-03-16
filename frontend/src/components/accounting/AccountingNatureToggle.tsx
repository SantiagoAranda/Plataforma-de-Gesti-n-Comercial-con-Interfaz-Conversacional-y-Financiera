"use client";

import type { Nature } from "@/src/types/accounting-form";

type Props = {
  value: Nature;
  onChange: (value: Nature) => void;
  disabled?: boolean;
  error?: string;
};

export function AccountingNatureToggle({
  value,
  onChange,
  disabled = false,
  error,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 text-xs font-semibold text-neutral-600">
        Naturaleza <span className="text-red-500">*</span>
      </div>

      <div
        className={`rounded-2xl border bg-neutral-50 p-1 ${
          error ? "border-red-300 bg-red-50" : "border-neutral-200"
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("DEBIT")}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              value === "DEBIT"
                ? "bg-emerald-500 text-white"
                : "bg-white text-neutral-700"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            Debito
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("CREDIT")}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              value === "CREDIT"
                ? "bg-emerald-500 text-white"
                : "bg-white text-neutral-700"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            Credito
          </button>
        </div>
      </div>

      {error && <span className="mt-1 text-xs font-medium text-red-500">{error}</span>}
    </div>
  );
}
