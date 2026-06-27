"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/src/lib/utils";
import { listUnits, type Ingredient, type IngredientStatus, type IngredientUnit, type Unit } from "@/src/services/inventory";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatMoney } from "@/src/lib/formatters";
import { formatUnit, INGREDIENT_UNIT_OPTIONS } from "@/src/components/inventory/unitLabels";
import { Lock, Info } from "lucide-react";

type SubmitValues = {
  name: string;
  stockUnitId: string;
  defaultPurchaseUnitId: string;
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
  hideTitle?: boolean;
  onValidationChange?: (isValid: boolean) => void;
  formRef?: RefObject<HTMLFormElement | null>;
};

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

const UNIT_KINDS: Record<string, string> = {
  UNIT: "COUNT",
  G: "WEIGHT",
  KG: "WEIGHT",
  LB: "WEIGHT",
  ML: "VOLUME",
  L: "VOLUME",
  PACKAGE: "COMMERCIAL",
  DOZEN: "COMMERCIAL",
  BOX: "COMMERCIAL",
};

function getUnitKind(code: string, unitsList: Unit[]): string {
  const found = unitsList.find((u) => u.code === code);
  if (found) return found.kind;
  return UNIT_KINDS[code] ?? "COUNT";
}

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
  hideTitle = false,
  onValidationChange,
  formRef,
}: Props) {
  const [name, setName] = useState(initial?.name ?? defaults?.name ?? "");
  const [consumptionUnit, setConsumptionUnit] = useState<IngredientUnit>(
    (initial?.stockUnit?.code as IngredientUnit | undefined) ?? initial?.consumptionUnit ?? defaults?.consumptionUnit ?? "UNIT",
  );
  const [purchaseUnit, setPurchaseUnit] = useState<IngredientUnit>(
    (initial?.defaultPurchaseUnit?.code as IngredientUnit | undefined) ?? initial?.purchaseUnit ?? defaults?.purchaseUnit ?? "UNIT",
  );
  const [units, setUnits] = useState<Unit[]>([]);
  
  // Custom equivalence factor (defaults to standard factor if compatible)
  const [equivalence, setEquivalence] = useState<string>(
    initial?.purchaseToConsumptionFactor?.toString() ??
    getConversionFactor(
      (initial?.defaultPurchaseUnit?.code as IngredientUnit | undefined) ?? initial?.purchaseUnit ?? defaults?.purchaseUnit ?? "UNIT",
      (initial?.stockUnit?.code as IngredientUnit | undefined) ?? initial?.consumptionUnit ?? defaults?.consumptionUnit ?? "UNIT"
    )?.toString() ?? "1"
  );

  // minStock in UI represents purchase units
  const getInitialMinStock = () => {
    if (mode === "edit" && initial) {
      const factor = Number(initial.purchaseToConsumptionFactor) || 1;
      const baseMinStock = Number(initial.minStock) || 0;
      return (baseMinStock / factor).toString();
    }
    return defaults?.minStock?.toString?.() ?? "0";
  };
  const [minStock, setMinStock] = useState(getInitialMinStock);
  const [status, setStatus] = useState<IngredientStatus>(initial?.status ?? "ACTIVE");

  // Track touched states for inline validation
  const [nameTouched, setNameTouched] = useState(false);
  const [equivalenceTouched, setEquivalenceTouched] = useState(false);
  const [minStockTouched, setMinStockTouched] = useState(false);

  useEffect(() => {
    let mounted = true;
    listUnits()
      .then((loadedUnits) => {
        if (mounted) setUnits(loadedUnits);
      })
      .catch((error) => {
        console.error("[ingredient units]", error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const purchaseUnitOptions = useMemo(() => {
    const allowed = PURCHASE_UNIT_OPTIONS_BY_STOCK[consumptionUnit] ?? [consumptionUnit];
    return INGREDIENT_UNIT_OPTIONS.filter((unit) => allowed.includes(unit.value));
  }, [consumptionUnit]);

  const selectedStockUnit = useMemo(
    () =>
      units.find((unit) => unit.code === consumptionUnit) ??
      (initial?.stockUnit?.code === consumptionUnit ? initial.stockUnit : null),
    [consumptionUnit, initial?.stockUnit, units],
  );

  const selectedDefaultPurchaseUnit = useMemo(
    () =>
      units.find((unit) => unit.code === purchaseUnit) ??
      (initial?.defaultPurchaseUnit?.code === purchaseUnit
        ? initial.defaultPurchaseUnit
        : null),
    [initial?.defaultPurchaseUnit, purchaseUnit, units],
  );

  // Auto-prefill equivalence when units change
  useEffect(() => {
    const stdFactor = getConversionFactor(purchaseUnit, consumptionUnit);
    if (stdFactor !== null) {
      setEquivalence(stdFactor.toString());
    } else {
      setEquivalence("");
    }
  }, [purchaseUnit, consumptionUnit]);

  // Adjust purchase unit selection if it becomes incompatible
  useEffect(() => {
    if (!purchaseUnitOptions.some((unit) => unit.value === purchaseUnit)) {
      setPurchaseUnit(purchaseUnitOptions[0]?.value ?? consumptionUnit);
    }
  }, [consumptionUnit, purchaseUnit, purchaseUnitOptions]);

  // Determine unit kind to enforce physical vs commercial conversions
  const isWeightOrVolume = useMemo(() => {
    const stockKind = getUnitKind(consumptionUnit, units);
    const purchaseKind = getUnitKind(purchaseUnit, units);
    return (
      (stockKind === "WEIGHT" && purchaseKind === "WEIGHT") ||
      (stockKind === "VOLUME" && purchaseKind === "VOLUME")
    );
  }, [consumptionUnit, purchaseUnit, units]);

  // Inline Validation Messages
  const nameError = useMemo(() => {
    if (!nameTouched) return null;
    if (!name.trim()) return "El nombre del insumo es obligatorio.";
    return null;
  }, [name, nameTouched]);

  const equivalenceError = useMemo(() => {
    if (!equivalenceTouched) return null;
    const num = Number(equivalence.replace(",", "."));
    if (isNaN(num) || num <= 0) return "La equivalencia debe ser un número mayor a cero.";
    return null;
  }, [equivalence, equivalenceTouched]);

  const minStockError = useMemo(() => {
    if (!minStockTouched) return null;
    const normalized = minStock.replace(",", ".").trim();
    if (!normalized) return null;
    const num = Number(normalized);
    if (isNaN(num) || num < 0) return "El stock mínimo debe ser un número válido.";
    return null;
  }, [minStock, minStockTouched]);

  // Submit check
  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!consumptionUnit || !purchaseUnit) return false;
    if (!selectedStockUnit?.id || !selectedDefaultPurchaseUnit?.id) return false;
    
    const eqNum = Number(equivalence.replace(",", "."));
    if (isNaN(eqNum) || eqNum <= 0) return false;

    const msNum = Number(minStock.replace(",", "."));
    if (isNaN(msNum) || msNum < 0) return false;

    return true;
  }, [name, consumptionUnit, purchaseUnit, selectedStockUnit, selectedDefaultPurchaseUnit, equivalence, minStock]);

  useEffect(() => {
    onValidationChange?.(canSubmit);
  }, [canSubmit, onValidationChange]);

  // Calculations for display helpers
  const equivalenceVal = parseFloat(equivalence.replace(",", ".")) || 0;
  const minStockVal = parseFloat(minStock.replace(",", ".")) || 0;
  const computedMinStockBase = equivalenceVal * minStockVal;

  const readonlyStock = initial ? formatMoney(parseNumber(initial.currentStock)) : null;
  const readonlyAvg = initial ? formatMoney(parseNumber(initial.averageCost)) : null;
  const stockUnitLabel = initial?.stockUnit?.symbol ?? formatUnit(consumptionUnit);

  const displayUnitLabel = (code: string) => {
    const option = INGREDIENT_UNIT_OPTIONS.find((opt) => opt.value === code);
    return option ? option.label : code;
  };

  const fields = (
    <div className="space-y-5">
      {initial && !hideReadOnlyMetrics && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Stock Actual</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {readonlyStock} {stockUnitLabel}
            </p>
          </div>
          <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Costo Promedio</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              ${readonlyAvg}/{stockUnitLabel}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-600">Recalculado automático</p>
          </div>
        </div>
      )}

      {/* Name input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500">Nombre del insumo</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          placeholder="Ej: Leche entera"
          className={cn(
            "w-full rounded-2xl border bg-white px-4 py-3 text-sm font-normal text-slate-800 placeholder:text-slate-400/70 outline-none shadow-sm focus:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500/20",
            nameError ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20" : "border-slate-200"
          )}
        />
        {nameError && (
          <p className="text-xs font-medium text-rose-600 mt-1">{nameError}</p>
        )}
      </div>

      {/* Units selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500">Unidad base de stock</label>
          <select
            value={consumptionUnit}
            onChange={(e) => setConsumptionUnit(e.target.value as IngredientUnit)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none shadow-sm focus:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500/20"
          >
            {STOCK_UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500">Unidad normal de compra</label>
          <select
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value as IngredientUnit)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none shadow-sm focus:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500/20"
          >
            {purchaseUnitOptions.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Real Equivalency */}
      {purchaseUnit !== consumptionUnit && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500">Equivalencia real</label>
          <div className={cn(
            "flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/30 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition-colors",
            isWeightOrVolume ? "bg-slate-100/50" : "bg-white"
          )}>
            <span className="text-sm font-normal text-slate-500 shrink-0">1 {formatUnit(purchaseUnit)} contiene</span>
            <input
              value={equivalence}
              onChange={(e) => setEquivalence(e.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={() => setEquivalenceTouched(true)}
              disabled={isWeightOrVolume}
              placeholder="Ej: 1000"
              inputMode="decimal"
              className={cn(
                "w-20 text-center text-sm font-semibold text-emerald-700 bg-emerald-50/60 border border-emerald-200 rounded-lg py-1 px-2 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/35 outline-none transition disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed",
                isWeightOrVolume ? "font-normal" : ""
              )}
            />
            <span className="text-sm font-normal text-slate-500 shrink-0">{displayUnitLabel(consumptionUnit)}</span>
            {isWeightOrVolume && (
              <span title="Relación física estándar bloqueada" className="shrink-0 ml-1">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
              </span>
            )}
          </div>
          {equivalenceError && (
            <p className="text-xs font-medium text-rose-600 mt-1">{equivalenceError}</p>
          )}
          {!equivalenceError && (
            <p className="text-[11px] font-normal text-slate-400 mt-1">
              Equivale a: {equivalence || "0"} {displayUnitLabel(consumptionUnit)}
            </p>
          )}
        </div>
      )}

      {/* Reorder point / minStock */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500">Punto de reorden (Stock mínimo)</label>
        <div className="relative flex items-center">
          <input
            value={minStock}
            onChange={(e) => setMinStock(e.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={() => setMinStockTouched(true)}
            placeholder="Ej: 1"
            inputMode="decimal"
            className={cn(
              "w-full rounded-2xl border bg-white pl-4 pr-24 py-3 text-sm font-normal text-slate-800 outline-none shadow-sm focus:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500/20",
              minStockError ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/20" : "border-slate-200"
            )}
          />
          <span className="absolute right-4 text-xs font-normal text-slate-400 truncate max-w-[80px]">
            {formatUnit(purchaseUnit)}(s)
          </span>
        </div>
        {minStockError && (
          <p className="text-xs font-medium text-rose-600 mt-1">{minStockError}</p>
        )}
        {!minStockError && (
          <div className="space-y-2 mt-2">
            <div className="rounded-xl bg-slate-100/60 px-3 py-2 text-[11px] text-slate-600 font-normal">
              Equivale a: <span className="font-semibold text-slate-800">{computedMinStockBase} {displayUnitLabel(consumptionUnit)}</span>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-sky-100/70 bg-sky-50/50 p-3 text-[11px] font-normal text-sky-700 leading-normal">
              <Info className="h-4 w-4 shrink-0 text-sky-500 mt-0.5" />
              <p>
                Te avisaremos cuando te queden menos de <span className="font-semibold text-sky-900">{minStock || "0"} {formatUnit(purchaseUnit)}(s)</span> ({computedMinStockBase} {displayUnitLabel(consumptionUnit)}) en inventario.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      {mode === "edit" && (
        <div className="space-y-2 pt-2 border-t border-slate-50">
          <label className="text-xs font-medium text-slate-500">Estado del insumo</label>
          <div className="flex rounded-full bg-slate-100 p-1">
            {(["ACTIVE", "INACTIVE"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "flex-1 rounded-full py-2 text-xs font-semibold transition active:scale-[0.98]",
                  status === s ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {s === "ACTIVE" ? "Activo" : "Inactivo"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;

        const factorNum = Number(equivalence.replace(",", "."));
        const minStockPurchase = Number(minStock.replace(",", "."));
        const calculatedMinStockBase = factorNum * minStockPurchase;

        const payload: SubmitValues = {
          name: name.trim(),
          stockUnitId: selectedStockUnit!.id,
          defaultPurchaseUnitId: selectedDefaultPurchaseUnit!.id,
          consumptionUnit,
          purchaseUnit,
          purchaseToConsumptionFactor: equivalence.replace(",", ".").trim(),
          minStock: calculatedMinStockBase.toString(),
          ...(mode === "edit" ? { status } : {}),
        };

        void onSubmit(payload);
      }}
      className={cn(
        "space-y-5",
        mode === "create" && !hideTitle ? "flex flex-col h-full max-h-full overflow-hidden space-y-0 w-full" : ""
      )}
    >
      {mode === "create" && !hideTitle && (
        <div className="shrink-0 bg-white px-5 pt-5 pb-3 border-b border-slate-100/50">
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Nuevo ingrediente</h2>
        </div>
      )}

      {mode === "create" ? (
        <div className={cn("space-y-5 min-h-0", hideTitle ? "" : "flex-1 overflow-y-auto px-5 py-4")}>
          {fields}
        </div>
      ) : (
        fields
      )}

      {!hideSubmitButton && (
        onCancel ? (
          <div className="grid grid-cols-2 gap-2 pt-2 shrink-0">
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
            className="h-12 w-full rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50 pt-2 shrink-0"
          >
            {submitting ? "Guardando..." : mode === "create" ? "Crear ingrediente" : "Guardar cambios"}
          </button>
        )
      )}
    </form>
  );
}
