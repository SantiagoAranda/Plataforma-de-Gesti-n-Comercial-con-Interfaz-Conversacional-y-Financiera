"use client";

import type { Nature } from "@/src/types/accounting-form";
import { cn } from "@/src/lib/utils";

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
      <div className="text-[10px] font-medium text-slate-400/90 uppercase tracking-wider mb-1.5 block px-1">
        NATURALEZA <span className="text-red-500">*</span>
      </div>

      <div
        className={cn(
          "rounded-2xl bg-slate-50/80 p-1 w-full border border-transparent transition-colors",
          error && "border-red-300 bg-red-50/50"
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("DEBIT")}
            className={cn(
              "rounded-xl px-2 py-2 transition sm:px-3 text-xs font-semibold",
              value === "DEBIT"
                ? "bg-[#0B3F64] text-white shadow-sm"
                : "bg-transparent text-slate-500 font-semibold text-xs",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            Débito
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("CREDIT")}
            className={cn(
              "rounded-xl px-2 py-2 transition sm:px-3 text-xs font-semibold",
              value === "CREDIT"
                ? "bg-[#0B3F64] text-white shadow-sm"
                : "bg-transparent text-slate-500 font-semibold text-xs",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            Crédito
          </button>
        </div>
      </div>

      {error && <span className="mt-1 text-xs font-medium text-red-500 px-1">{error}</span>}
    </div>
  );
}
