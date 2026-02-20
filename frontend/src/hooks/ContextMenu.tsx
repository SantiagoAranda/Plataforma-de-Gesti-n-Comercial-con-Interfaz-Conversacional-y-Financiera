"use client";

import React, { useEffect } from "react";

type Props = {
    open: boolean;
    x: number;
    y: number;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
};

export function ContextMenu({ open, x, y, onClose, onEdit, onDelete }: Props) {
    useEffect(() => {
        if (!open) return;

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        const onAnyClick = () => onClose();

        window.addEventListener("keydown", onEsc);
        window.addEventListener("click", onAnyClick);
        window.addEventListener("scroll", onAnyClick, true);

        return () => {
            window.removeEventListener("keydown", onEsc);
            window.removeEventListener("click", onAnyClick);
            window.removeEventListener("scroll", onAnyClick, true);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1000]" aria-hidden="true">
            <div
                className="absolute min-w-[180px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
                style={{ left: x, top: y }}
                role="menu"
            >
                <button
                    type="button"
                    onClick={() => {
                        onEdit();
                        onClose();
                    }}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-neutral-50 transition"
                >
                    Editar
                </button>

                <button
                    type="button"
                    onClick={() => {
                        onDelete();
                        onClose();
                    }}
                    className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-neutral-50 transition"
                >
                    Eliminar
                </button>
            </div>
        </div>
    );
}
