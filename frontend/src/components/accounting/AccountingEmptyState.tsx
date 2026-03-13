"use client";

import { PlusCircle } from "lucide-react";

type Props = {
  onCreate: () => void;
};

export function AccountingEmptyState({ onCreate }: Props) {
  return (
    <div className="rounded-[32px] bg-white px-6 py-10 text-center shadow-sm ring-1 ring-black/5">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <PlusCircle className="h-7 w-7 text-emerald-600" />
      </div>

      <h2 className="mt-4 text-xl font-semibold text-neutral-900">
        Aún no hay movimientos
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
        Registrá tu primer movimiento contable desde el botón <span className="font-semibold">+</span> y confirmalo con enviar.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
      >
        <PlusCircle className="h-4 w-4" />
        Crear movimiento
      </button>
    </div>
  );
}