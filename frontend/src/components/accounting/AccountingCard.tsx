import * as React from "react";
import type { AccountingEntry } from "../../types/accounting";

import { useContextMenu } from "@/src/hooks/useContextMenu";
import { ContextMenu } from "@/src/hooks/ContextMenu";

function formatMoney(v: number) {
    const abs = Math.abs(v);
    return `$${abs.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Impacto contable real
 */
function isPositiveImpact(entry: AccountingEntry) {
    const a = entry.amount;

    switch (entry.kind) {
        case "INCOME":
            return true;
        case "EXPENSE":
            return false;
        case "ASSET":
            return a >= 0;
        case "LIABILITY":
            return a < 0;
        case "EQUITY":
            return a >= 0;
        default:
            return a >= 0;
    }
}

function amountClass(positive: boolean) {
    return positive ? "text-emerald-600" : "text-red-500";
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

function badgeClass(positive: boolean) {
    return positive
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-neutral-100 text-neutral-600 border-neutral-200";
}

export function AccountingCard({
    entry,
    onEdit,
    onDelete,
}: {
    entry: AccountingEntry;
    onEdit: (entry: AccountingEntry) => void;
    onDelete: (entry: AccountingEntry) => void;
}) {
    const positive = isPositiveImpact(entry);

    // ✅ long-press (mobile) + click derecho (desktop)
    const { open, pos, close, handlers } = useContextMenu(500);

    return (
        <>
            <div
                className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4 select-none"
                {...handlers}
            >
                <div className="flex justify-between">
                    <div>
                        <div className="font-semibold text-neutral-800">
                            {entry.pucCode} - {entry.accountName}
                        </div>
                        <div className="text-sm text-neutral-500">{entry.description}</div>
                    </div>

                    <div className={`font-semibold flex items-center gap-1 ${amountClass(positive)}`}>
                        <span>{positive ? "↑" : "↓"}</span>
                        <span>{formatMoney(entry.amount)}</span>
                    </div>
                </div>

                <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
                    <span>{entry.time}</span>
                    <span className={`px-3 py-1 rounded-full border ${badgeClass(positive)}`}>
                        {badgeLabel(entry.source)}
                    </span>
                </div>
            </div>

            <ContextMenu
                open={open}
                x={pos.x}
                y={pos.y}
                onClose={close}
                onEdit={() => onEdit(entry)}
                onDelete={() => onDelete(entry)}
            />
        </>
    );
}