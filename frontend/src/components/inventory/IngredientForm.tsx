"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/src/lib/utils";
import { listUnits, type Ingredient, type IngredientPurchasePresentation, type IngredientStatus, type IngredientUnit, type Unit, type UnitCode } from "@/src/services/inventory";
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
  purchasePresentationDraft?: {
    name: string;
    purchaseUnitId: string;
    innerQuantity: string;
    innerUnitLabel?: string;
    contentQuantity: string;
    contentUnitId: string;
    isDefault: boolean;
    isActive: boolean;
  };
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
  "L:ML": 1000,
  "ML:L": 0.001,
  "M:CM": 100,
  "CM:M": 0.01,
  "DOZEN:UNIT": 12,
  "SIX_PACK:UNIT": 6,
};

const STOCK_UNIT_CODES: UnitCode[] = ["UNIT", "G", "KG", "ML", "L", "CM", "M"];

const STOCK_UNIT_OPTIONS = INGREDIENT_UNIT_OPTIONS.filter((unit) => STOCK_UNIT_CODES.includes(unit.value));

type PurchaseSuggestion = {
  code: UnitCode;
  label: string;
  factorToBaseUnit: number | null;
  isLocked: boolean;
};

const PURCHASE_SUGGESTIONS_BY_STOCK: Record<string, PurchaseSuggestion[]> = {
  UNIT: [
    { code: "SIX_PACK", label: "Six-pack", factorToBaseUnit: 6, isLocked: true },
    { code: "DOZEN", label: "Docena", factorToBaseUnit: 12, isLocked: true },
    { code: "BOX", label: "Caja", factorToBaseUnit: null, isLocked: false },
    { code: "PACKAGE", label: "Paquete", factorToBaseUnit: null, isLocked: false },
  ],
  G: [
    { code: "KG", label: "Kilogramo", factorToBaseUnit: 1000, isLocked: true },
    { code: "PACKAGE", label: "Paquete", factorToBaseUnit: null, isLocked: false },
    { code: "BAG", label: "Bolsa", factorToBaseUnit: null, isLocked: false },
    { code: "BOX", label: "Caja", factorToBaseUnit: null, isLocked: false },
    { code: "BUCKET", label: "Balde", factorToBaseUnit: null, isLocked: false },
    { code: "BULTO", label: "Bulto", factorToBaseUnit: null, isLocked: false },
  ],
  KG: [
    { code: "PACKAGE", label: "Paquete", factorToBaseUnit: null, isLocked: false },
    { code: "BAG", label: "Bolsa", factorToBaseUnit: null, isLocked: false },
    { code: "BOX", label: "Caja", factorToBaseUnit: null, isLocked: false },
    { code: "BUCKET", label: "Balde", factorToBaseUnit: null, isLocked: false },
    { code: "GARRAFA", label: "Garrafa", factorToBaseUnit: null, isLocked: false },
    { code: "BULTO", label: "Bulto", factorToBaseUnit: null, isLocked: false },
  ],
  ML: [
    { code: "L", label: "Litro", factorToBaseUnit: 1000, isLocked: true },
    { code: "BOTTLE", label: "Botella", factorToBaseUnit: null, isLocked: false },
    { code: "GARRAFA", label: "Garrafa", factorToBaseUnit: null, isLocked: false },
    { code: "BIDON", label: "Bidón", factorToBaseUnit: null, isLocked: false },
    { code: "BOX", label: "Caja", factorToBaseUnit: null, isLocked: false },
  ],
  L: [
    { code: "BOTTLE", label: "Botella", factorToBaseUnit: null, isLocked: false },
    { code: "GARRAFA", label: "Garrafa", factorToBaseUnit: null, isLocked: false },
    { code: "BIDON", label: "Bidón", factorToBaseUnit: null, isLocked: false },
    { code: "BOX", label: "Caja", factorToBaseUnit: null, isLocked: false },
  ],
  CM: [
    { code: "M", label: "Metro", factorToBaseUnit: 100, isLocked: true },
    { code: "ROLL", label: "Rollo", factorToBaseUnit: null, isLocked: false },
  ],
  M: [
    { code: "ROLL", label: "Rollo", factorToBaseUnit: null, isLocked: false },
  ],
};

const LEGACY_UNIT_BY_CODE: Record<string, IngredientUnit> = {
  UNIT: "UNIT",
  G: "G",
  KG: "KG",
  ML: "ML",
  L: "L",
  DOZEN: "DOZEN",
  PACKAGE: "PACKAGE",
  BOX: "BOX",
  CM: "UNIT",
  M: "UNIT",
  SIX_PACK: "UNIT",
  BAG: "UNIT",
  BUCKET: "UNIT",
  BULTO: "UNIT",
  BOTTLE: "UNIT",
  GARRAFA: "UNIT",
  BIDON: "UNIT",
  ROLL: "UNIT",
};

function getConversionFactor(from: string, to: string): number | null {
  if (from === to) return 1;
  return STANDARD_FACTORS[`${from}:${to}`] ?? null;
}

function getPresentationFactor(presentation: IngredientPurchasePresentation) {
  const direct = Number(presentation.factorToBaseUnit);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const inner = Number(presentation.innerQuantity ?? 1);
  const content = Number(presentation.contentQuantity ?? 1);
  const factor = inner * content;
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

function selectDisplayPresentation(ingredient?: Ingredient | null) {
  const presentations = ingredient?.purchasePresentations?.filter((presentation) => presentation.isActive) ?? [];
  return (
    presentations.find((presentation) => presentation.isDefault) ??
    presentations.find((presentation) => !presentation.isLocked) ??
    presentations.find((presentation) => presentation.isLocked) ??
    null
  );
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
  const initialPresentation = useMemo(() => selectDisplayPresentation(initial), [initial]);
  const [name, setName] = useState(initial?.name ?? defaults?.name ?? "");
  const [consumptionUnit, setConsumptionUnit] = useState<UnitCode>(
    (initial?.stockUnit?.code as UnitCode | undefined) ?? (defaults?.consumptionUnit as UnitCode | undefined) ?? initial?.consumptionUnit ?? "UNIT",
  );
  const [purchaseUnit, setPurchaseUnit] = useState<UnitCode>(
    (initialPresentation?.purchaseUnit?.code as UnitCode | undefined) ??
      (initial?.defaultPurchaseUnit?.code as UnitCode | undefined) ??
      (defaults?.purchaseUnit as UnitCode | undefined) ??
      initial?.purchaseUnit ??
      "UNIT",
  );
  const [units, setUnits] = useState<Unit[]>([]);
  
  // Custom equivalence factor (defaults to standard factor if compatible)
  const [equivalence, setEquivalence] = useState<string>(
    (initialPresentation ? String(getPresentationFactor(initialPresentation)) : undefined) ??
    initial?.purchaseToConsumptionFactor?.toString() ??
    getConversionFactor(
      (initial?.defaultPurchaseUnit?.code as UnitCode | undefined) ?? (defaults?.purchaseUnit as UnitCode | undefined) ?? initial?.purchaseUnit ?? "UNIT",
      (initial?.stockUnit?.code as UnitCode | undefined) ?? (defaults?.consumptionUnit as UnitCode | undefined) ?? initial?.consumptionUnit ?? "UNIT"
    )?.toString() ?? "1"
  );

  // minStock in UI represents purchase units
  const getInitialMinStock = () => {
    if (mode === "edit" && initial) {
      const factor = initialPresentation
        ? getPresentationFactor(initialPresentation)
        : Number(initial.purchaseToConsumptionFactor) || 1;
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

  const selectedStockUnit = useMemo(
    () =>
      units.find((unit) => unit.code === consumptionUnit) ??
      (initial?.stockUnit?.code === consumptionUnit ? initial.stockUnit : null),
    [consumptionUnit, initial?.stockUnit, units],
  );

  const purchaseUnitOptions = useMemo(() => {
    const suggestions = PURCHASE_SUGGESTIONS_BY_STOCK[consumptionUnit] ?? [];
    return suggestions.filter((suggestion) => units.some((unit) => unit.code === suggestion.code));
  }, [consumptionUnit, units]);

  const selectedPurchaseSuggestion = useMemo(
    () => purchaseUnitOptions.find((unit) => unit.code === purchaseUnit) ?? null,
    [purchaseUnit, purchaseUnitOptions],
  );

  const selectedPersistedPresentation = useMemo(
    () =>
      initial?.purchasePresentations?.find(
        (presentation) => presentation.isActive && presentation.purchaseUnit?.code === purchaseUnit,
      ) ?? null,
    [initial?.purchasePresentations, purchaseUnit],
  );

  const isPurchasePresentationEditable = selectedPurchaseSuggestion?.isLocked === false;
  const isPurchaseConversionLocked = selectedPurchaseSuggestion?.isLocked === true;

  const sameUnitSuggestion: PurchaseSuggestion = useMemo(
    () => ({
      code: consumptionUnit,
      label: formatUnit(consumptionUnit),
      factorToBaseUnit: 1,
      isLocked: true,
    }),
    [consumptionUnit],
  );

  const effectivePurchaseSuggestion = selectedPurchaseSuggestion ?? sameUnitSuggestion;

  const selectedPurchaseUnitRecord = useMemo(
    () =>
      units.find((unit) => unit.code === effectivePurchaseSuggestion.code) ??
      (initial?.defaultPurchaseUnit?.code === effectivePurchaseSuggestion.code
        ? initial.defaultPurchaseUnit
        : null),
    [effectivePurchaseSuggestion.code, initial?.defaultPurchaseUnit, units],
  );

  const selectedContentUnitForPresentation = useMemo(
    () =>
      units.find((unit) => unit.code === consumptionUnit) ??
      (initial?.stockUnit?.code === consumptionUnit ? initial.stockUnit : null),
    [consumptionUnit, initial?.stockUnit, units],
  );

  const defaultPurchaseUnitForPayload = useMemo(() => {
    if (isPurchasePresentationEditable) return selectedStockUnit;
    return selectedPurchaseUnitRecord ?? selectedStockUnit;
  }, [isPurchasePresentationEditable, selectedPurchaseUnitRecord, selectedStockUnit]);

  const selectedDefaultPurchaseUnit = useMemo(
    () => defaultPurchaseUnitForPayload,
    [defaultPurchaseUnitForPayload],
  );

  // Auto-prefill equivalence when units change
  useEffect(() => {
    const stdFactor = getConversionFactor(purchaseUnit, consumptionUnit);
    if (selectedPersistedPresentation) {
      setEquivalence(String(getPresentationFactor(selectedPersistedPresentation)));
    } else if (selectedPurchaseSuggestion?.factorToBaseUnit) {
      setEquivalence(String(selectedPurchaseSuggestion.factorToBaseUnit));
    } else if (stdFactor !== null) {
      setEquivalence(String(stdFactor));
    } else {
      setEquivalence("");
    }
  }, [purchaseUnit, consumptionUnit, selectedPurchaseSuggestion, selectedPersistedPresentation]);

  // Adjust purchase unit selection if it becomes incompatible
  useEffect(() => {
    if (units.length === 0) return;
    if (!purchaseUnitOptions.some((unit) => unit.code === purchaseUnit)) {
      setPurchaseUnit(purchaseUnitOptions[0]?.code ?? consumptionUnit);
    }
  }, [consumptionUnit, purchaseUnit, purchaseUnitOptions, units.length]);

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
    if (isPurchasePresentationEditable && (!selectedPurchaseUnitRecord?.id || !selectedContentUnitForPresentation?.id)) return false;
    
    const eqNum = Number(equivalence.replace(",", "."));
    if (isNaN(eqNum) || eqNum <= 0) return false;

    const msNum = Number(minStock.replace(",", "."));
    if (isNaN(msNum) || msNum < 0) return false;

    return true;
  }, [
    name,
    consumptionUnit,
    purchaseUnit,
    selectedStockUnit,
    selectedDefaultPurchaseUnit,
    isPurchasePresentationEditable,
    selectedPurchaseUnitRecord,
    selectedContentUnitForPresentation,
    equivalence,
    minStock,
  ]);

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
            onChange={(e) => setConsumptionUnit(e.target.value as UnitCode)}
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
            onChange={(e) => setPurchaseUnit(e.target.value as UnitCode)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-800 outline-none shadow-sm focus:border-emerald-500 transition-colors focus:ring-1 focus:ring-emerald-500/20"
          >
            {purchaseUnitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.label}{unit.isLocked ? " (fija)" : ""}
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
            isPurchaseConversionLocked ? "bg-slate-100/50" : "bg-white"
          )}>
            <span className="text-sm font-normal text-slate-500 shrink-0">1 {formatUnit(purchaseUnit)} contiene</span>
            <input
              value={equivalence}
              onChange={(e) => setEquivalence(e.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={() => setEquivalenceTouched(true)}
              disabled={isPurchaseConversionLocked}
              placeholder="Ej: 1000"
              inputMode="decimal"
              className={cn(
                "w-20 text-center text-sm font-semibold text-emerald-700 bg-emerald-50/60 border border-emerald-200 rounded-lg py-1 px-2 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/35 outline-none transition disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed",
                isPurchaseConversionLocked ? "font-normal" : ""
              )}
            />
            <span className="text-sm font-normal text-slate-500 shrink-0">{displayUnitLabel(consumptionUnit)}</span>
            {isPurchaseConversionLocked && (
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
        const normalizedEquivalence = equivalence.replace(",", ".").trim();
        const purchasePresentationDraft =
          isPurchasePresentationEditable && selectedPurchaseUnitRecord?.id && selectedContentUnitForPresentation?.id
            ? {
                name: selectedPurchaseSuggestion?.label ?? selectedPurchaseUnitRecord.name,
                purchaseUnitId: selectedPurchaseUnitRecord.id,
                innerQuantity: "1",
                contentQuantity: normalizedEquivalence,
                contentUnitId: selectedContentUnitForPresentation.id,
                isDefault: true,
                isActive: true,
              }
            : undefined;

        const payload: SubmitValues = {
          name: name.trim(),
          stockUnitId: selectedStockUnit!.id,
          defaultPurchaseUnitId: selectedDefaultPurchaseUnit!.id,
          consumptionUnit: LEGACY_UNIT_BY_CODE[consumptionUnit] ?? "UNIT",
          purchaseUnit: LEGACY_UNIT_BY_CODE[purchaseUnit] ?? "UNIT",
          purchaseToConsumptionFactor: normalizedEquivalence,
          purchasePresentationDraft,
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
