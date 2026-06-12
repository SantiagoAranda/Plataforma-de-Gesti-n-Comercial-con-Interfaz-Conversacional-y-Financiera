"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/src/lib/utils";
import type { Ingredient, IngredientStatus, IngredientUnit } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatMoney } from "@/src/lib/formatters";
import { formatIngredientUnit, formatUnit, INGREDIENT_UNIT_OPTIONS } from "@/src/components/inventory/unitLabels";

type SubmitValues = {
  name: string;
  consumptionUnit: IngredientUnit;
  purchaseUnit: IngredientUnit;
  purchaseToConsumptionFactor: string;
  customUnitLabel: string;
  minStock: string;
  status?: IngredientStatus;
};

type Props = {
  initial?: Ingredient | null;
  defaults?: Partial<Omit<SubmitValues, "status">>;
  mode: "create" | "edit";
  onSubmit: (values: SubmitValues) => Promise<void>;
  submitting?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  hideSubmitButton?: boolean;
  hideReadOnlyMetrics?: boolean;
  onValidationChange?: (isValid: boolean) => void;
  formRef?: RefObject<HTMLFormElement | null>;
};

export function IngredientForm({
  initial,
  defaults,
  mode,
  onSubmit,
  submitting,
  onCancel,
  cancelLabel = "Cancelar",
  hideSubmitButton = false,
  hideReadOnlyMetrics = false,
  onValidationChange,
  formRef,
}: Props) {
  const [name, setName] = useState(initial?.name ?? defaults?.name ?? "");
  const [consumptionUnit, setConsumptionUnit] = useState(
    initial?.consumptionUnit ?? defaults?.consumptionUnit ?? "UNIT",
  );
  const [purchaseUnit, setPurchaseUnit] = useState(
    initial?.purchaseUnit ?? defaults?.purchaseUnit ?? "UNIT",
  );
  const [customUnitLabel, setCustomUnitLabel] = useState(
    initial?.customUnitLabel ?? defaults?.customUnitLabel ?? "",
  );
  const [factor, setFactor] = useState(
    initial?.purchaseToConsumptionFactor?.toString?.() ??
      defaults?.purchaseToConsumptionFactor?.toString?.() ??
      "",
  );
  const [minStock, setMinStock] = useState(
    initial?.minStock?.toString?.() ?? defaults?.minStock?.toString?.() ?? "0",
  );
  const [status, setStatus] = useState<IngredientStatus>(initial?.status ?? "ACTIVE");

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!consumptionUnit) return false;
    if (!purchaseUnit) return false;

    const normalizedFactor = factor.replace(",", ".").trim();
    if (!/^\d+(\.\d+)?$/.test(normalizedFactor)) return false;
    if (/^0+(\.0+)?$/.test(normalizedFactor)) return false;

    const normalizedMinStock = minStock.replace(",", ".").trim();
    if (!/^\d+(\.\d+)?$/.test(normalizedMinStock)) return false;

    return true;
  }, [name, consumptionUnit, purchaseUnit, factor, minStock]);

  useEffect(() => {
    onValidationChange?.(canSubmit);
  }, [canSubmit, onValidationChange]);

  const readonlyStock = initial ? formatMoney(parseNumber(initial.currentStock)) : null;
  const readonlyAvg = initial ? formatMoney(parseNumber(initial.averageCost)) : null;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const normalizedFactor = factor.replace(",", ".").trim();
        const normalizedMinStock = minStock.replace(",", ".").trim() || "0";
        void onSubmit({
          name: name.trim(),
          consumptionUnit,
          purchaseUnit,
          purchaseToConsumptionFactor: normalizedFactor,
          customUnitLabel: customUnitLabel.trim(),
          minStock: normalizedMinStock,
          ...(mode === "edit" ? { status } : {}),
        });
      }}
      className="space-y-5"
    >
      {initial && !hideReadOnlyMetrics && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Stock</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">
              {readonlyStock} {formatIngredientUnit(initial)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-neutral-400">Solo v&iacute;a movimientos</p>
          </div>
          <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Costo prom.</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">${readonlyAvg}</p>
            <p className="mt-1 text-[11px] font-medium text-neutral-400">Se recalcula autom&aacute;ticamente</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Nombre
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Harina 000"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Unidad consumo
          </label>
          <select
            value={consumptionUnit}
            onChange={(e) => setConsumptionUnit(e.target.value as IngredientUnit)}
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
          >
            {INGREDIENT_UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Unidad compra
          </label>
          <select
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value as IngredientUnit)}
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
          >
            {INGREDIENT_UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Label visual opcional
        </label>
        <input
          value={customUnitLabel}
          onChange={(e) => setCustomUnitLabel(e.target.value)}
          placeholder="Ej: rodajas, paquetes, potes"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
        />
        <p className="text-[11px] font-medium text-neutral-400">
          Solo cambia c&oacute;mo se muestra la unidad. La unidad base sigue controlada.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Factor compra &rarr; consumo
        </label>
        <input
          value={factor}
          onChange={(e) => setFactor(e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder="Ej: 1000"
          inputMode="decimal"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
        />
        <p className="text-[11px] font-medium text-neutral-400">
          Ejemplo: 1 {formatUnit(purchaseUnit)} = {factor || "1000"} {customUnitLabel.trim() || formatUnit(consumptionUnit)}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Stock mínimo (alerta)
        </label>
        <input
          value={minStock}
          onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder="Ej: 10"
          inputMode="decimal"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
        />
        <p className="text-[11px] font-medium text-neutral-400">
          Si el stock queda por debajo de este valor, se marcará como “Stock bajo”. Usa 0 para desactivar.
        </p>
      </div>

      {mode === "edit" && (
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Estado
          </label>
          <div className="flex rounded-full bg-neutral-100 p-1">
            {(["ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "flex-1 rounded-full py-2 text-xs font-semibold transition",
                  status === s ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
                )}
              >
                {s === "ACTIVE" ? "Activo" : "Inactivo"}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hideSubmitButton && (
        onCancel ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 rounded-2xl bg-neutral-100 text-sm font-semibold text-neutral-600 transition active:scale-[0.99]"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || !!submitting}
              className="h-12 rounded-2xl bg-emerald-500 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              {submitting ? "Guardando..." : mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit || !!submitting}
            className="h-12 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? "Guardando..." : mode === "create" ? "Crear ingrediente" : "Guardar cambios"}
          </button>
        )
      )}
    </form>
  );
}

