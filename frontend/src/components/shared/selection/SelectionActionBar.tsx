"use client";

import { Eye, Pencil, Trash2, X } from "lucide-react";

type Props = {
    visible: boolean;
    title?: string;
    onClose: () => void;
    onEdit?: () => void;
    onView?: () => void;
    onDelete?: () => void;
    editLabel?: string;
    viewLabel?: string;
    deleteLabel?: string;
};

export function SelectionActionBar({
    visible,
    title = "1 seleccionado",
    onClose,
    onEdit,
    onView,
    onDelete,
    editLabel = "",
    viewLabel = "Ver",
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
                <div className="flex items-center gap-2 sm:gap-3">
                    {onView && (
                        <button
                            type="button"
                            onClick={onView}
                            title={viewLabel}
                            aria-label={viewLabel}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 shadow-sm active:scale-95"
                        >
                            <Eye className="h-5 w-5" />
                        </button>
                    )}

                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            title={editLabel}
                            aria-label={editLabel}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 shadow-sm active:scale-95"
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                    )}

                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            title={deleteLabel}
                            aria-label={deleteLabel}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100 shadow-sm active:scale-95"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    )}

                    <div className="h-6 w-px bg-neutral-200 mx-1 hidden sm:block" />

                    <button
                        type="button"
                        onClick={onClose}
                        title="Cerrar selección"
                        aria-label="Cerrar selección"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-800 shadow-sm active:scale-95"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

            </div>
        </div>
    );
}