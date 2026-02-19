"use client";

import * as React from "react";
import type { AccountingType } from "../../types/accounting";

type Props = {
    value: AccountingType;
    onChange: (v: AccountingType) => void;
};

export function AccountingFilters({ value, onChange }: Props) {
    const items: { key: AccountingType; label: string }[] = [
        { key: "ALL", label: "Todos" },
        { key: "INCOME", label: "Ingresos" },
        { key: "EXPENSE", label: "Gastos" },
        { key: "ASSET", label: "Activos" },
    ];

    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item) => {
                const active = value === item.key;

                return (
                    <button
                        key={item.key}
                        onClick={() => onChange(item.key)}
                        className={`px-4 py-2 rounded-full text-sm border transition ${active
                                ? "bg-green-500 text-white border-green-500"
                                : "bg-white border-neutral-200 text-neutral-600"
                            }`}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
