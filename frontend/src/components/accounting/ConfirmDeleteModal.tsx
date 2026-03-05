"use client";

import * as React from "react";

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

export function ConfirmDeleteModal({
    open,
    count,
    onCancel,
    onConfirm,
    // opcional: si querés forzar disabled desde afuera
    confirmDisabled = false,
}: {
    open: boolean;
    count: number;
    onCancel: () => void;
    onConfirm: () => void;
    confirmDisabled?: boolean;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1300]">
            <button
                type="button"
                className="absolute inset-0 bg-black/40"
                onClick={onCancel}
                aria-label="Cerrar"
            />

            <div className="absolute left-0 right-0 bottom-0 pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto w-full sm:max-w-2xl lg:max-w-3xl px-4">
                    <div className="rounded-t-3xl bg-white border border-neutral-200 shadow-[0_-20px_40px_rgba(0,0,0,0.25)] p-5">
                        <div className="text-base font-semibold text-neutral-900">
                            Confirmar eliminación
                        </div>

                        <div className="mt-2 text-sm text-neutral-600">
                            Vas a eliminar {count} {count === 1 ? "asiento" : "asientos"}. Esta acción no se puede deshacer.
                        </div>

                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 h-11 rounded-2xl border border-neutral-200 bg-white hover:bg-neutral-50 transition text-sm font-semibold text-neutral-700"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={confirmDisabled}
                                className={cn(
                                    "flex-1 h-11 rounded-2xl border text-sm font-semibold transition",
                                    confirmDisabled
                                        ? "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
                                        : "bg-red-600 border-red-600 hover:bg-red-700 text-white",
                                )}
                            >
                                Eliminar
                            </button>
                        </div>

                        {confirmDisabled && (
                            <div className="mt-3 text-xs text-zinc-500">
                                No se puede eliminar si hay asientos Confirmados/Anulados seleccionados.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}