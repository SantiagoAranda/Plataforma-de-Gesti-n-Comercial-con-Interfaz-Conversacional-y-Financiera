"use client";

import * as React from "react";
import { X, Info, Pencil, Trash2 } from "lucide-react";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function AccountingSelectionBar({
  count,
  canDetails,
  canEdit,
  canDelete,
  onCancel,
  onDetails,
  onEdit,
  onDelete,
}: {
  count: number;

  // ✅ flags desde page.tsx
  canDetails: boolean;
  canEdit: boolean;
  canDelete: boolean;

  onCancel: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-[1000]",
        "bg-white/90 backdrop-blur-xl border-b border-neutral-200 shadow-sm",
        "pt-[env(safe-area-inset-top)]",
      )}
      role="toolbar"
      aria-label="Acciones de selección"
    >
      <div className="mx-auto w-full sm:max-w-2xl lg:max-w-3xl px-4">
        <div className="h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onCancel}
              className="h-10 w-10 rounded-full hover:bg-neutral-100 transition flex items-center justify-center"
              aria-label="Cancelar selección"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-sm font-semibold text-neutral-900 truncate">
              {count} {count === 1 ? "seleccionada" : "seleccionadas"}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDetails}
              disabled={!canDetails}
              className={cn(
                "h-10 w-10 rounded-full transition flex items-center justify-center",
                canDetails ? "hover:bg-neutral-100" : "opacity-35 cursor-not-allowed",
              )}
              aria-label="Ver detalles"
              title={!canDetails ? "Solo disponible con 1 seleccionada" : "Ver detalles"}
            >
              <Info className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onEdit}
              disabled={!canEdit}
              className={cn(
                "h-10 w-10 rounded-full transition flex items-center justify-center",
                canEdit ? "hover:bg-neutral-100" : "opacity-35 cursor-not-allowed",
              )}
              aria-label="Editar"
              title={
                !canEdit
                  ? "Solo se puede editar un asiento en BORRADOR"
                  : "Editar"
              }
            >
              <Pencil className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete}
              className={cn(
                "h-10 w-10 rounded-full transition flex items-center justify-center",
                canDelete
                  ? "hover:bg-red-50 text-red-600"
                  : "opacity-35 cursor-not-allowed text-zinc-400",
              )}
              aria-label="Eliminar"
              title={
                !canDelete
                  ? "Solo se pueden eliminar asientos en BORRADOR"
                  : "Eliminar"
              }
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}