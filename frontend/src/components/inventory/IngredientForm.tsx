"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/src/lib/utils";
import type { Ingredient, IngredientStatus, IngredientUnit } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatMoney } from "@/src/lib/formatters";
import { formatUnit, INGREDIENT_UNIT_OPTIONS } from "@/src/components/inventory/unitLabels";

type SubmitValues = {
  name: string;
  consumptionUnit: IngredientUnit;
  purchaseUnit: IngredientUnit;
  purchaseToConsumptionFactor?: string;
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

/**
 * Hard-coded standard conversions. The backend stores these in UnitConversion
 * but we replicate them here for simple validation in the create/edit form.
 */
const STANDARD_FACTORS: Record<string, number> = {
  "KG:G": 1000,
  "G:KG": 0.001,
  "LB:G": 500,
  "L:ML": 1000,
  "ML:L": 0.001,
  "PACKAGE:UNIT": 6,
  "DOZEN:UNIT": 12,
  "BOX:UNIT": 24,
};

const STOCK_UNIT_OPTIONS = INGREDIENT_UNIT_OPTIONS.filter((unit) =>
  ["UNIT", "G", "ML"].includes(unit.value),
);

const PURCHASE_UNIT_OPTIONS_BY_STOCK: Record<string, IngredientUnit[]> = {
  UNIT: ["UNIT", "PACKAGE", "DOZEN", "BOX"],
  G: ["G", "KG", "LB"],
  ML: ["ML", "L"],
};

function getConversionFactor(from: string, to: string): number | null {
  if (from === to) return 1;
  return STANDARD_FACTORS[`${from}:${to}`] ?? null;
}

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
  const [consumptionUnit, setConsumptionUnit] = useState<IngredientUnit>(
    initial?.consumptionUnit ?? defaults?.consumptionUnit ?? "UNIT",
  );
  const [purchaseUnit, setPurchaseUnit] = useState<IngredientUnit>(
    initial?.purchaseUnit ?? defaults?.purchaseUnit ?? "UNIT",
  );
  const [minStock, setMinStock] = useState(
    initial?.minStock?.toString?.() ?? defaults?.minStock?.toString?.() ?? "0",
  );
  const [status, setStatus] = useState<IngredientStatus>(initial?.status ?? "ACTIVE");

  const conversionFactor = useMemo(
    () => getConversionFactor(purchaseUnit, consumptionUnit),
    [purchaseUnit, consumptionUnit],
  );

  const purchaseUnitOptions = useMemo(() => {
    const allowed = PURCHASE_UNIT_OPTIONS_BY_STOCK[consumptionUnit] ?? [consumptionUnit];
    return INGREDIENT_UNIT_OPTIONS.filter((unit) => allowed.includes(unit.value));
  }, [consumptionUnit]);

  useEffect(() => {
    if (!purchaseUnitOptions.some((unit) => unit.value === purchaseUnit)) {
      setPurchaseUnit(purchaseUnitOptions[0]?.value ?? consumptionUnit);
    }
  }, [consumptionUnit, purchaseUnit, purchaseUnitOptions]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!consumptionUnit || !purchaseUnit) return false;
    if (conversionFactor === null) return false;
    const normalizedMinStock = minStock.replace(",", ".").trim();
    if (!/^\d+(\.\d+)?$/.test(normalizedMinStock)) return false;
    return true;
  }, [name, consumptionUnit, purchaseUnit, conversionFactor, minStock]);

  useEffect(() => {
    onValidationChange?.(canSubmit);
  }, [canSubmit, onValidationChange]);

  const readonlyStock = initial ? formatMoney(parseNumber(initial.currentStock)) : null;
  const readonlyAvg = initial ? formatMoney(parseNumber(initial.averageCost)) : null;
  const stockUnitLabel = initial?.stockUnit?.symbol ?? formatUnit(consumptionUnit);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;

        const payload: SubmitValues = {
          name: name.trim(),
          consumptionUnit,
          purchaseUnit,
          minStock: minStock.replace(",", ".").trim() || "0",
          ...(mode === "edit" ? { status } : {}),
        };

        void onSubmit(payload);
      }}
      className="space-y-4"
    >
      {initial && !hideReadOnlyMetrics && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Actual</p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {readonlyStock} {stockUnitLabel}
            </p>
          </div>
          <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Costo Promedio</p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              ${readonlyAvg}/{stockUnitLabel}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-600">Recalculado automático</p>
          </div>
        </div>
      )}

      {/* BLOQUE A — Stock base */}
      <section className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Datos del insumo</p>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Configuración</span>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del Insumo</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Harina 000"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidad base de stock</label>
            <select
              value={consumptionUnit}
              onChange={(e) => setConsumptionUnit(e.target.value as IngredientUnit)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
            >
              {STOCK_UNIT_OPTIONS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidad normal de compra</label>
            <select
              value={purchaseUnit}
              onChange={(e) => setPurchaseUnit(e.target.value as IngredientUnit)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
            >
              {purchaseUnitOptions.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversion factor preview */}
        {conversionFactor !== null && purchaseUnit !== consumptionUnit && (
          <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-[11px] font-semibold text-emerald-900">
            Conversión: 1 {formatUnit(purchaseUnit)} = {formatMoney(conversionFactor)} {formatUnit(consumptionUnit)}
          </div>
        )}

        {conversionFactor === null && (
          <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-[11px] font-semibold text-rose-800">
            No hay conversión estándar entre {formatUnit(purchaseUnit)} y {formatUnit(consumptionUnit)}. Seleccioná una combinación compatible.
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Mínimo de Alerta</label>
          <div className="relative flex items-center">
            <input
              value={minStock}
              onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="Ej: 10"
              inputMode="decimal"
              className="w-full rounded-2xl border border-slate-200 bg-white pl-4 pr-16 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
            />
            <span className="absolute right-4 text-xs font-bold text-slate-400">
              {formatUnit(consumptionUnit)}
            </span>
          </div>
        </div>

        {mode === "edit" && (
          <div className="space-y-2 pt-2 border-t border-slate-50">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado del Insumo</label>
            <div className="flex rounded-full bg-slate-100 p-1">
              {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 rounded-full py-2 text-xs font-bold transition active:scale-[0.98]",
                    status === s ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {s === "ACTIVE" ? "Activo" : "Inactivo"}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {!hideSubmitButton && (
        onCancel ? (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-600 transition active:scale-[0.98]"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || !!submitting}
              className="h-12 rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Guardando..." : mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit || !!submitting}
            className="h-12 w-full rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50 pt-2"
          >
            {submitting ? "Guardando..." : mode === "create" ? "Crear ingrediente" : "Guardar cambios"}
          </button>
        )
      )}
    </form>
  );
}
