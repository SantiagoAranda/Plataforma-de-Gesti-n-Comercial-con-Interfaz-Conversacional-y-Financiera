"use client";

import { useMemo, useState } from "react";

import { cn } from "@/src/lib/utils";
import type { Ingredient, IngredientStatus } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatMoney } from "@/src/lib/formatters";

type SubmitValues = {
  name: string;
  consumptionUnit: string;
  purchaseUnit: string;
  purchaseToConsumptionFactor: number;
  status?: IngredientStatus;
};

type Props = {
  initial?: Ingredient | null;
  mode: "create" | "edit";
  onSubmit: (values: SubmitValues) => Promise<void>;
  submitting?: boolean;
};

export function IngredientForm({ initial, mode, onSubmit, submitting }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [consumptionUnit, setConsumptionUnit] = useState(initial?.consumptionUnit ?? "");
  const [purchaseUnit, setPurchaseUnit] = useState(initial?.purchaseUnit ?? "");
  const [factor, setFactor] = useState(
    initial?.purchaseToConsumptionFactor?.toString?.() ?? "",
  );
  const [status, setStatus] = useState<IngredientStatus>(initial?.status ?? "ACTIVE");

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!consumptionUnit.trim()) return false;
    if (!purchaseUnit.trim()) return false;
    const numFactor = Number(factor.replace(",", "."));
    if (!Number.isFinite(numFactor) || numFactor <= 0) return false;
    return true;
  }, [name, consumptionUnit, purchaseUnit, factor]);

  const readonlyStock = initial ? formatMoney(parseNumber(initial.currentStock)) : null;
  const readonlyAvg = initial ? formatMoney(parseNumber(initial.averageCost)) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const numFactor = Number(factor.replace(",", "."));
        void onSubmit({
          name: name.trim(),
          consumptionUnit: consumptionUnit.trim(),
          purchaseUnit: purchaseUnit.trim(),
          purchaseToConsumptionFactor: numFactor,
          ...(mode === "edit" ? { status } : {}),
        });
      }}
      className="space-y-5"
    >
      {initial && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Stock</p>
            <p className="mt-1 text-sm font-black text-neutral-900">
              {readonlyStock} {initial.consumptionUnit}
            </p>
            <p className="mt-1 text-[11px] font-medium text-neutral-400">Solo v&iacute;a movimientos</p>
          </div>
          <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Costo prom.</p>
            <p className="mt-1 text-sm font-black text-neutral-900">${readonlyAvg}</p>
            <p className="mt-1 text-[11px] font-medium text-neutral-400">Se recalcula autom&aacute;ticamente</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Nombre
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Harina 000"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Unidad consumo
          </label>
          <input
            value={consumptionUnit}
            onChange={(e) => setConsumptionUnit(e.target.value)}
            placeholder="Ej: g"
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Unidad compra
          </label>
          <input
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value)}
            placeholder="Ej: kg"
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Factor compra &rarr; consumo
        </label>
        <input
          value={factor}
          onChange={(e) => setFactor(e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder="Ej: 1000"
          inputMode="decimal"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
        />
        <p className="text-[11px] font-medium text-neutral-400">
          Ejemplo: 1 {purchaseUnit || "kg"} = {factor || "1000"} {consumptionUnit || "g"}
        </p>
      </div>

      {mode === "edit" && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Estado
          </label>
          <div className="flex rounded-full bg-neutral-100 p-1">
            {(["ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "flex-1 rounded-full py-2 text-xs font-bold transition",
                  status === s ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
                )}
              >
                {s === "ACTIVE" ? "Activo" : "Inactivo"}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || !!submitting}
        className="h-12 w-full rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "Guardando..." : mode === "create" ? "Crear ingrediente" : "Guardar cambios"}
      </button>
    </form>
  );
}

