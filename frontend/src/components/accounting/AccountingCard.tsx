import * as React from "react";
import type { AccountingEntry } from "../../types/accounting";

function formatMoney(v: number) {
    const sign = v >= 0 ? "+" : "-";
    const abs = Math.abs(v);
    return `${sign}$${abs.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function amountClass(v: number) {
    return v >= 0 ? "text-green-600" : "text-red-500";
}

function badgeLabel(source: AccountingEntry["source"]) {
    switch (source) {
        case "AUTO_ORDER":
            return "ORDEN AUTOMÁTICA";
        case "MANUAL":
            return "MANUAL";
        case "SYSTEM":
            return "SISTEMA";
        case "RECURRENT":
            return "RECURRENTE";
    }
}

function iconBg(kind: AccountingEntry["kind"]) {
    switch (kind) {
        case "INCOME":
            return "bg-green-100 text-green-600";
        case "EXPENSE":
            return "bg-red-100 text-red-600";
        case "ASSET":
            return "bg-blue-100 text-blue-600";
        case "LIABILITY":
            return "bg-amber-100 text-amber-700";
        case "EQUITY":
            return "bg-purple-100 text-purple-700";
    }
}

export function AccountingCard({
    entry,
}: {
    entry: AccountingEntry;
}) {
    return (
        <div className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4">
            <div className="flex gap-3">
                <div
                    className={`h-11 w-11 rounded-full flex items-center justify-center ${iconBg(
                        entry.kind
                    )}`}
                >
                    💰
                </div>

                <div className="flex-1">
                    <div className="flex justify-between">
                        <div>
                            <div className="font-semibold text-neutral-800">
                                {entry.pucCode} - {entry.accountName}
                            </div>
                            <div className="text-sm text-neutral-500">
                                {entry.description}
                            </div>
                        </div>

                        <div className={`font-semibold ${amountClass(entry.amount)}`}>
                            {formatMoney(entry.amount)}
                        </div>
                    </div>

                    <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
                        <span>{entry.time}</span>
                        <span className="px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200">
                            {badgeLabel(entry.source)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
