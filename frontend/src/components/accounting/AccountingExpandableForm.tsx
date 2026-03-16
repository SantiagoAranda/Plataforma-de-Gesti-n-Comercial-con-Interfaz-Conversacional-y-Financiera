"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingPucSearch } from "./AccountingPucSearch";
import { AccountingNatureToggle } from "./AccountingNatureToggle";

type AccountingFormErrors = {
  puc?: string;
  date?: string;
  amount?: string;
  nature?: string;
};

type Props = {
  value: AccountingFormState;
  errors: AccountingFormErrors;
  onChange: Dispatch<SetStateAction<AccountingFormState>>;
  lockFinancialFields?: boolean;
};

export function AccountingExpandableForm({
  value,
  errors,
  onChange,
  lockFinancialFields = false,
}: Props) {
  return (
    <div className="max-h-[min(42vh,420px)] overflow-y-auto rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.14)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
          <div className="min-w-0">
            <AccountingPucSearch value={value} onChange={onChange} error={errors.puc} />
          </div>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-neutral-600">
              Fecha <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              value={value.date}
              disabled={lockFinancialFields}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, date: e.target.value }))
              }
              className={`w-full rounded-2xl border px-3 py-3 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                errors.date
                  ? "border-red-300 bg-red-50 focus:border-red-400"
                  : "border-neutral-200 bg-neutral-50 focus:border-emerald-400"
              }`}
            />
            {errors.date && (
              <span className="text-xs font-medium text-red-500">{errors.date}</span>
            )}
          </label>
        </div>

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 sm:grid-cols-[130px_minmax(0,1fr)] md:grid-cols-[150px_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-neutral-600">
              Valor <span className="text-red-500">*</span>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.amount}
              disabled={lockFinancialFields}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, amount: e.target.value }))
              }
              className={`w-full rounded-2xl border px-3 py-3 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                errors.amount
                  ? "border-red-300 bg-red-50 focus:border-red-400"
                  : "border-neutral-200 bg-neutral-50 focus:border-emerald-400"
              }`}
              placeholder="0.00"
            />
            {errors.amount && (
              <span className="text-xs font-medium text-red-500">{errors.amount}</span>
            )}
          </label>

          <div className="min-w-0">
            <AccountingNatureToggle
              value={value.nature}
              error={errors.nature}
              disabled={lockFinancialFields}
              onChange={(nature) =>
                onChange((prev) => ({ ...prev, nature }))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
