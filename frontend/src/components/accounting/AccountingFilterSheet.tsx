"use client";

import type { AccountingType } from "@/src/types/accounting";
import { AccountingFilters } from "./AccountingFilters";

export function AccountingFilterSheet({
    open,
    onClose,
    value,
    onChange,
}: {
    open: boolean;
    onClose: () => void;
    value: AccountingType;
    onChange: (v: AccountingType) => void;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100]">
            <button
                type="button"
                className="absolute inset-0 bg-black/30"
                onClick={onClose}
                aria-label="Cerrar filtros"
            />

            <div className="absolute left-0 right-0 bottom-0 rounded-t-3xl bg-white border-t border-neutral-200 p-4 shadow-[0_-20px_40px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-800">Filtros</div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-full hover:bg-neutral-100 transition"
                        aria-label="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                <div className="mt-4">
                    <AccountingFilters
                        value={value}
                        onChange={(v) => {
                            onChange(v);
                            onClose();
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
