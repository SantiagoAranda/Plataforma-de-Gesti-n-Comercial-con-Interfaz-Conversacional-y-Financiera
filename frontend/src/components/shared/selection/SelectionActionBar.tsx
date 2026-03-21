"use client";

import { Eye, EyeOff, Pencil, Trash2, ArrowLeft, LucideIcon } from "lucide-react";

type Props = {
    visible: boolean;
    title?: string;
    onClose: () => void;
    onEdit?: () => void;
    onView?: () => void;
    onDelete?: () => void;
    onToggleStatus?: () => void;
    editLabel?: string;
    viewLabel?: string;
    deleteLabel?: string;
    toggleStatusLabel?: string;
    deleteIcon?: LucideIcon;
    viewIcon?: LucideIcon;
};

export function SelectionActionBar({
    visible,
    title = "1 seleccionado",
    onClose,
    onEdit,
    onView,
    onDelete,
    onToggleStatus,
    editLabel = "",
    viewLabel = "Ver",
    deleteLabel = "",
    toggleStatusLabel = "Inhabilitar",
    deleteIcon: DeleteIcon = Trash2,
    viewIcon: ViewIcon = Eye,
}: Props) {
    if (!visible) return null;

    return (
        <div className="sticky top-0 z-40 w-full border-b border-black/5 bg-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <div className="mx-auto flex min-h-[72px] w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">

                {/* Left: Back Button and Title */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Volver / Salir de selección"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 leading-tight">
                        <h1 className="truncate text-[18px] sm:text-[20px] font-semibold text-neutral-900">
                            {title}
                        </h1>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex shrink-0 items-center justify-end gap-2">
                    {onView && (
                        <button
                            type="button"
                            onClick={onView}
                            title={viewLabel}
                            aria-label={viewLabel}
                            className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
                        >
                            <ViewIcon className="h-5 w-5" />
                        </button>
                    )}

                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            title={editLabel}
                            aria-label={editLabel}
                            className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                    )}

                    {onToggleStatus && (
                        <button
                            type="button"
                            onClick={onToggleStatus}
                            title={toggleStatusLabel}
                            aria-label={toggleStatusLabel}
                            className="grid h-10 w-10 place-items-center rounded-full text-amber-600 transition hover:bg-amber-50 active:scale-95"
                        >
                            <EyeOff className="h-5 w-5" />
                        </button>
                    )}

                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            title={deleteLabel}
                            aria-label={deleteLabel}
                            className="grid h-10 w-10 place-items-center rounded-full text-rose-600 transition hover:bg-rose-50 active:scale-95"
                        >
                            <DeleteIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}