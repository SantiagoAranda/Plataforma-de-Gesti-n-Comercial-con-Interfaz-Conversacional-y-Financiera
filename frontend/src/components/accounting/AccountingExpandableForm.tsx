"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AccountingFormState } from "@/src/types/accounting-form";
import { AccountingPucSearch } from "./AccountingPucSearch";
import { AccountingNatureToggle } from "./AccountingNatureToggle";

type Props = {
  value: AccountingFormState;
  onChange: Dispatch<SetStateAction<AccountingFormState>>;
};

export function AccountingExpandableForm({ value, onChange }: Props) {
  return (
    <div className="max-h-[min(42vh,420px)] overflow-y-auto rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.14)]">
      <div className="flex flex-col gap-3">
        {/* Mobile: PUC y Fecha separados. Desktop: juntos */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
          <div className="min-w-0">
            <AccountingPucSearch value={value} onChange={onChange} />
          </div>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-neutral-600">Fecha</span>
            <input
              type="date"
              value={value.date}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, date: e.target.value }))
              }
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </label>
        </div>

        {/* Mobile y desktop: Valor + Naturaleza juntos.
            Valor más chico para darle más aire a Naturaleza */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 sm:grid-cols-[130px_minmax(0,1fr)] md:grid-cols-[150px_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-neutral-600">Valor</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.amount}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="0.00"
            />
          </label>

          <div className="min-w-0">
            <AccountingNatureToggle
              value={value.nature}
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