"use client";

import { Sparkles } from "lucide-react";

export function MovementEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5 space-y-3">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="text-lg font-semibold text-neutral-900">Aún no hay movimientos</div>
      <div className="text-sm text-neutral-500">
        Registrá ventas o asientos para ver el resumen financiero de tu negocio.
      </div>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Ir a contabilidad
        </button>
      ) : null}
    </div>
  );
}
