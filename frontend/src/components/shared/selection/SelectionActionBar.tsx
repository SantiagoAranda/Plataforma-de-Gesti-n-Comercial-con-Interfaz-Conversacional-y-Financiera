"use client";

import { Pencil, Trash2, X } from "lucide-react";

type Props = {
    visible: boolean;
    title?: string;
    onClose: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    editLabel?: string;
    deleteLabel?: string;
};

export function SelectionActionBar({
    visible,
    title = "1 seleccionado",
    onClose,
    onEdit,
    onDelete,
    editLabel = "",
    deleteLabel = "",
}: Props) {
    if (!visible) return null;

    return (
        <div className="sticky top-0 z-40 border-b border-black/5 bg-[#f6f8f6]/95 backdrop-blur">
            <div className="mx-auto flex h-[64px] w-full max-w-3xl items-center justify-between px-3 sm:px-4">

                {/* Texto */}
                <div className="flex items-center text-base font-semibold text-neutral-900">
                    {title}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2">
                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="flex h-10 items-center gap-2 rounded-full bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
                        >
                            <Pencil className="h-4 w-4" />
                            {editLabel}
                        </button>
                    )}

                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            className="flex h-10 items-center gap-2 rounded-full bg-rose-50 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                        >
                            <Trash2 className="h-4 w-4" />
                            {deleteLabel}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200"
                        aria-label="Cerrar selección"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

            </div>
        </div>
    );
}