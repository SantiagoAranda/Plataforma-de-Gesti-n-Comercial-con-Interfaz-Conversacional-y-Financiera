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
    <div className="rounded-[32px] bg-white p-6 border border-slate-200/80 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
      <div className="flex flex-col gap-0.5 mb-5 px-1">
        <h2 className="font-bold text-slate-900 text-lg">Movimiento Contable</h2>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">GESTIÓN PUC</span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <AccountingPucSearch value={value} onChange={onChange} error={errors.puc} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col">
            <span className="text-[10px] font-bold text-slate-400/90 uppercase tracking-wider mb-1.5 block px-1">
              FECHA <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              value={value.date}
              disabled={lockFinancialFields}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, date: e.target.value }))
              }
              className={`w-full h-12 px-4 rounded-2xl bg-slate-50/80 border border-transparent text-sm font-normal text-slate-800 outline-none focus:bg-white focus:border-slate-100 focus:ring-0 transition ${
                errors.date ? "border-red-300 bg-red-50/50" : ""
              }`}
            />
            {errors.date && (
              <span className="text-xs font-medium text-red-500 mt-1 px-1">{errors.date}</span>
            )}
          </label>

          <label className="flex min-w-0 flex-col">
            <span className="text-[10px] font-bold text-slate-400/90 uppercase tracking-wider mb-1.5 block px-1">
              VALOR <span className="text-red-500">*</span>
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
              className={`w-full h-12 px-4 rounded-2xl bg-slate-50/80 border border-transparent text-sm font-normal text-slate-800 outline-none focus:bg-white focus:border-slate-100 focus:ring-0 transition ${
                errors.amount ? "border-red-300 bg-red-50/50" : ""
              }`}
              placeholder="0.00"
            />
            {errors.amount && (
              <span className="text-xs font-medium text-red-500 mt-1 px-1">{errors.amount}</span>
            )}
          </label>
        </div>

        <div className="min-w-0 mb-2">
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
  );
}
