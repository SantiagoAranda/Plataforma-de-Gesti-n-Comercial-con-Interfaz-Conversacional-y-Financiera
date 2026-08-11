"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  X,
} from "lucide-react";
import type { IngredientDeactivationImpact } from "@/src/services/inventory";

type Props = {
  impact: IngredientDeactivationImpact;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function IngredientDeactivationImpactModal({
  impact,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasDependencies = impact.summary.total > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, submitting]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingredient-deactivation-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="ingredient-deactivation-title"
                className="font-bold text-slate-900"
              >
                ¿Desactivar {impact.ingredientName}?
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {hasDependencies
                  ? "Este ingrediente se utiliza actualmente. Las configuraciones afectadas deberán revisarse antes de volver a operar normalmente."
                  : "El ingrediente ya no podrá utilizarse en nuevas compras, recetas ni movimientos de inventario."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Cerrar advertencia"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {hasDependencies && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Recetas", impact.summary.recipes],
                ["Servicios", impact.summary.services],
                ["Opciones", impact.summary.itemOptions],
              ].map(([label, count]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl bg-blue-50 px-2 py-3 text-center"
                >
                  <div className="text-lg font-bold text-[#0B3F64]">
                    {count}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Desactivar este ingrediente no eliminará ni modificará
              automáticamente estas relaciones. Los cambios posteriores en la
              composición pueden afectar costos y consumos.
            </div>

            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-semibold text-[#0B3F64] hover:bg-blue-50"
            >
              Ver dependencias
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {expanded && (
              <div className="max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-blue-100 p-3 text-sm">
                {impact.dependencies.recipes.length > 0 && (
                  <DependencyList
                    title="Recetas afectadas"
                    names={impact.dependencies.recipes.map(
                      (entry) => entry.itemName,
                    )}
                  />
                )}
                {impact.dependencies.services.length > 0 && (
                  <DependencyList
                    title="Servicios afectados"
                    names={impact.dependencies.services.map(
                      (entry) => entry.itemName,
                    )}
                  />
                )}
                {impact.dependencies.itemOptions.length > 0 && (
                  <DependencyList
                    title="Opciones afectadas"
                    names={impact.dependencies.itemOptions.map(
                      (entry) => `${entry.itemName}: ${entry.optionName}`,
                    )}
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Desactivar ingrediente
          </button>
        </div>
      </div>
    </div>
  );
}

function DependencyList({ title, names }: { title: string; names: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <ul className="mt-1 space-y-1 text-slate-700">
        {names.map((name, index) => (
          <li key={`${name}-${index}`}>• {name}</li>
        ))}
      </ul>
    </div>
  );
}
