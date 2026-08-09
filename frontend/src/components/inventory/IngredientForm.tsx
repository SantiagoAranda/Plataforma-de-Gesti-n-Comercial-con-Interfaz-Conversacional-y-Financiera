"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Info } from "lucide-react";

import { CustomSelect } from "@/src/components/ui/CustomSelect";
import {
  listUnitConversions,
  listUnits,
  type Ingredient,
  type IngredientStatus,
  type IngredientUnit,
  type Unit,
  type UnitConversion,
} from "@/src/services/inventory";
import { cn } from "@/src/lib/utils";
import {
  directConversionFactor,
  decimalPayload,
  formatQuantity,
  normalizeDecimal,
  positiveDecimal,
  presentationFactorFromFields,
} from "./purchasePresentation";

export type IngredientFormValues = {
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
    innerUnitLabel: string;
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
  defaults?: Partial<Omit<IngredientFormValues, "status">>;
  mode: "create" | "edit";
  onSubmit: (values: IngredientFormValues) => Promise<void>;
  submitting?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  hideSubmitButton?: boolean;
  hideReadOnlyMetrics?: boolean;
  hideTitle?: boolean;
  onValidationChange?: (isValid: boolean) => void;
  formRef?: RefObject<HTMLFormElement | null>;
};

const STOCK_CODES = new Set(["UNIT", "G", "KG", "ML", "L", "CM", "M"]);

const LEGACY_UNIT_BY_CODE: Record<string, IngredientUnit> = {
  UNIT: "UNIT",
  G: "G",
  KG: "KG",
  ML: "ML",
  L: "L",
  DOZEN: "DOZEN",
  PACKAGE: "PACKAGE",
  BOX: "BOX",
  LB: "LB",
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

function initialPresentation(ingredient?: Ingredient | null) {
  const presentations =
    ingredient?.purchasePresentations?.filter((item) => item.isActive) ?? [];
  return (
    presentations.find((item) => item.isDefault && !item.isLocked) ??
    presentations.find((item) => !item.isLocked) ??
    presentations.find((item) => item.isDefault) ??
    null
  );
}

function inputClass(error = false) {
  return cn(
    "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none shadow-sm transition focus:ring-1",
    error
      ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200"
      : "border-slate-200 focus:border-[#0B3F64] focus:ring-[#0B3F64]/20",
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
  const selectedInitialPresentation = useMemo(
    () => initialPresentation(initial),
    [initial],
  );
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [name, setName] = useState(initial?.name ?? defaults?.name ?? "");
  const [stockUnitId, setStockUnitId] = useState(
    initial?.stockUnitId ??
      initial?.stockUnit?.id ??
      defaults?.stockUnitId ??
      "",
  );
  const [purchaseUnitId, setPurchaseUnitId] = useState(
    selectedInitialPresentation?.purchaseUnitId ??
      initial?.defaultPurchaseUnitId ??
      initial?.defaultPurchaseUnit?.id ??
      defaults?.defaultPurchaseUnitId ??
      "",
  );
  const [innerQuantity, setInnerQuantity] = useState(
    selectedInitialPresentation
      ? String(selectedInitialPresentation.innerQuantity)
      : "",
  );
  const [innerUnitLabel, setInnerUnitLabel] = useState(
    selectedInitialPresentation?.innerUnitLabel ?? "",
  );
  const [contentQuantity, setContentQuantity] = useState(
    selectedInitialPresentation
      ? String(selectedInitialPresentation.contentQuantity)
      : "",
  );
  const [contentUnitId, setContentUnitId] = useState(
    selectedInitialPresentation?.contentUnitId ?? "",
  );
  const [status, setStatus] = useState<IngredientStatus>(
    initial?.status ?? "ACTIVE",
  );
  const initialFactor = Number(
    selectedInitialPresentation?.factorToBaseUnit ??
      initial?.purchaseToConsumptionFactor ??
      1,
  );
  const [minStockInPurchaseUnits, setMinStockInPurchaseUnits] = useState(() => {
    const base = Number(initial?.minStock ?? defaults?.minStock ?? 0);
    return mode === "edit" &&
      Number.isFinite(initialFactor) &&
      initialFactor > 0
      ? String(base / initialFactor)
      : String(defaults?.minStock ?? "0");
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([listUnits(), listUnitConversions()])
      .then(([loadedUnits, loadedConversions]) => {
        if (!mounted) return;
        setUnits(loadedUnits);
        setConversions(loadedConversions);
        const initialStock =
          stockUnitId ||
          loadedUnits.find((unit) => unit.code === initial?.consumptionUnit)
            ?.id ||
          loadedUnits.find((unit) => unit.code === "UNIT")?.id ||
          "";
        setStockUnitId(initialStock);
        setPurchaseUnitId((current) => current || initialStock);
        setContentUnitId((current) => current || initialStock);
      })
      .catch((error) =>
        console.error("[ingredient presentation units]", error),
      );
    return () => {
      mounted = false;
    };
    // Initialization deliberately runs once; subsequent changes are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stockUnit =
    units.find((unit) => unit.id === stockUnitId) ?? initial?.stockUnit ?? null;
  const selectedPurchaseUnit =
    units.find((unit) => unit.id === purchaseUnitId) ??
    selectedInitialPresentation?.purchaseUnit ??
    initial?.defaultPurchaseUnit ??
    null;
  const isCommercial = selectedPurchaseUnit?.kind === "COMMERCIAL";

  const stockUnits = units.filter(
    (unit) =>
      unit.isActive && unit.kind !== "COMMERCIAL" && STOCK_CODES.has(unit.code),
  );
  const purchaseUnits = useMemo(() => {
    if (!stockUnitId) return [];
    return units.filter((unit) => {
      if (!unit.isActive) return false;
      if (unit.kind === "COMMERCIAL") return true;
      return directConversionFactor(unit.id, stockUnitId, conversions) !== null;
    });
  }, [conversions, stockUnitId, units]);
  const compatibleContentUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.isActive &&
          unit.kind !== "COMMERCIAL" &&
          directConversionFactor(unit.id, stockUnitId, conversions) !== null,
      ),
    [conversions, stockUnitId, units],
  );

  const factorToBaseUnit = isCommercial
    ? presentationFactorFromFields(
        innerQuantity,
        contentQuantity,
        contentUnitId,
        stockUnitId,
        conversions,
      )
    : directConversionFactor(purchaseUnitId, stockUnitId, conversions);
  const minStockValue = Number(
    normalizeDecimal(minStockInPurchaseUnits || "0"),
  );
  const minStockBase =
    factorToBaseUnit !== null &&
    Number.isFinite(minStockValue) &&
    minStockValue >= 0
      ? minStockValue * factorToBaseUnit
      : null;
  const internalAtMinimum =
    isCommercial &&
    positiveDecimal(innerQuantity) &&
    Number.isFinite(minStockValue)
      ? minStockValue * Number(normalizeDecimal(innerQuantity))
      : null;

  const matchingPresentation = initial?.purchasePresentations?.find(
    (presentation) =>
      !presentation.isLocked && presentation.purchaseUnitId === purchaseUnitId,
  );
  const presentationName =
    matchingPresentation?.name || selectedPurchaseUnit?.name || "Presentación";
  const stockLabel = stockUnit?.symbol || stockUnit?.name || "unidad base";
  const purchaseLabel =
    selectedPurchaseUnit?.symbol ||
    selectedPurchaseUnit?.name ||
    "presentación";
  const contentUnit =
    units.find((unit) => unit.id === contentUnitId) ??
    selectedInitialPresentation?.contentUnit;
  const contentLabel = contentUnit?.symbol || contentUnit?.name || "";

  const commercialValid =
    !isCommercial ||
    (positiveDecimal(innerQuantity) &&
      Boolean(innerUnitLabel.trim()) &&
      positiveDecimal(contentQuantity) &&
      Boolean(contentUnitId) &&
      factorToBaseUnit !== null);
  const minimumValid =
    /^\d+(\.\d{1,6})?$/.test(
      normalizeDecimal(minStockInPurchaseUnits || "0"),
    ) &&
    minStockValue >= 0 &&
    minStockBase !== null;
  const canSubmit = Boolean(
    name.trim() &&
    stockUnitId &&
    purchaseUnitId &&
    factorToBaseUnit !== null &&
    commercialValid &&
    minimumValid,
  );

  useEffect(() => {
    onValidationChange?.(canSubmit);
  }, [canSubmit, onValidationChange]);

  const changeStockUnit = (nextId: string) => {
    setStockUnitId(nextId);
    setPurchaseUnitId(nextId);
    setContentUnitId(nextId);
    setInnerQuantity("");
    setInnerUnitLabel("");
    setContentQuantity("");
  };

  const changePurchaseUnit = (nextId: string) => {
    setPurchaseUnitId(nextId);
    const next = units.find((unit) => unit.id === nextId);
    const persisted = initial?.purchasePresentations?.find(
      (presentation) =>
        !presentation.isLocked && presentation.purchaseUnitId === nextId,
    );
    if (next?.kind === "COMMERCIAL") {
      setInnerQuantity(persisted ? String(persisted.innerQuantity) : "");
      setInnerUnitLabel(persisted?.innerUnitLabel ?? "");
      setContentQuantity(persisted ? String(persisted.contentQuantity) : "");
      setContentUnitId(persisted?.contentUnitId ?? stockUnitId);
    }
  };

  const fields = (
    <div className="space-y-5">
      {!hideReadOnlyMetrics && mode === "edit" && initial ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Stock actual
            </p>
            <p className="mt-1 text-sm font-semibold">
              {initial.currentStock} {stockLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Costo promedio
            </p>
            <p className="mt-1 text-sm font-semibold">
              ${initial.averageCost}/{stockLabel}
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Nombre del insumo
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          className={inputClass(Boolean(touched.name && !name.trim()))}
          placeholder="Ej: Levadura"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Unidad base de stock
        </label>
        <CustomSelect
          value={stockUnitId}
          onChange={changeStockUnit}
          options={stockUnits.map((unit) => ({
            value: unit.id,
            label: `${unit.name} (${unit.symbol})`,
          }))}
        />
        <p className="text-[11px] text-slate-400">
          El stock, costo promedio, kardex y punto de reorden se almacenan en
          esta unidad.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Presentación de compra
        </label>
        <CustomSelect
          value={purchaseUnitId}
          onChange={changePurchaseUnit}
          options={purchaseUnits.map((unit) => ({
            value: unit.id,
            label: `${unit.name}${unit.kind === "COMMERCIAL" ? " (comercial)" : ` (${unit.symbol})`}`,
          }))}
        />
        <p className="text-[11px] text-slate-400">
          El sistema convertirá automáticamente cada compra a la unidad base.
        </p>
      </div>

      {isCommercial ? (
        <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-800">
              Contenido de la presentación
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Ejemplo: una caja contiene 24 paquetes y cada paquete contiene 500
              gramos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-600">
                Cantidad contenida
              </label>
              <input
                value={innerQuantity}
                onChange={(event) =>
                  setInnerQuantity(event.target.value.replace(/[^0-9.,]/g, ""))
                }
                inputMode="decimal"
                className={inputClass(
                  Boolean(
                    touched.innerQuantity && !positiveDecimal(innerQuantity),
                  ),
                )}
                onBlur={() =>
                  setTouched((current) => ({ ...current, innerQuantity: true }))
                }
                placeholder="24"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-600">
                Nombre de la unidad contenida
              </label>
              <input
                value={innerUnitLabel}
                onChange={(event) => setInnerUnitLabel(event.target.value)}
                onBlur={() =>
                  setTouched((current) => ({
                    ...current,
                    innerUnitLabel: true,
                  }))
                }
                className={inputClass(
                  Boolean(touched.innerUnitLabel && !innerUnitLabel.trim()),
                )}
                placeholder="paquete"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-600">
                Contenido de cada unidad
              </label>
              <input
                value={contentQuantity}
                onChange={(event) =>
                  setContentQuantity(
                    event.target.value.replace(/[^0-9.,]/g, ""),
                  )
                }
                onBlur={() =>
                  setTouched((current) => ({
                    ...current,
                    contentQuantity: true,
                  }))
                }
                inputMode="decimal"
                className={inputClass(
                  Boolean(
                    touched.contentQuantity &&
                    !positiveDecimal(contentQuantity),
                  ),
                )}
                placeholder="500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-600">
                Unidad del contenido
              </label>
              <CustomSelect
                value={contentUnitId}
                onChange={setContentUnitId}
                options={compatibleContentUnits.map((unit) => ({
                  value: unit.id,
                  label: `${unit.name} (${unit.symbol})`,
                }))}
              />
            </div>
          </div>
          {factorToBaseUnit !== null ? (
            <div className="rounded-xl border border-emerald-100 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Equivalencia total
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                1 {purchaseLabel} = {innerQuantity} {innerUnitLabel.trim()} ×{" "}
                {contentQuantity} {contentLabel} ={" "}
                {formatQuantity(factorToBaseUnit)} {stockLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Se agregarán {formatQuantity(factorToBaseUnit)} {stockLabel} al
                stock por cada {purchaseLabel} comprada.
              </p>
            </div>
          ) : (
            <p className="text-xs font-medium text-rose-600">
              Completa los campos con una unidad de contenido compatible.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Punto de reorden
        </label>
        <div className="relative">
          <input
            value={minStockInPurchaseUnits}
            onChange={(event) =>
              setMinStockInPurchaseUnits(
                event.target.value.replace(/[^0-9.,]/g, ""),
              )
            }
            inputMode="decimal"
            className={inputClass(Boolean(touched.minStock && !minimumValid))}
            onBlur={() =>
              setTouched((current) => ({ ...current, minStock: true }))
            }
            placeholder="2"
          />
          <span className="absolute right-4 top-3 text-xs text-slate-400">
            {purchaseLabel}
          </span>
        </div>
        {minStockBase !== null ? (
          <div className="rounded-xl bg-slate-100/70 px-3 py-2 text-[11px] text-slate-600">
            {isCommercial && internalAtMinimum !== null ? (
              <span>
                Equivale a {formatQuantity(internalAtMinimum)}{" "}
                {innerUnitLabel.trim() || "unidades"} o{" "}
                {formatQuantity(minStockBase)} {stockLabel}.
              </span>
            ) : (
              <span>
                Equivale a {formatQuantity(minStockBase)} {stockLabel}.
              </span>
            )}
          </div>
        ) : null}
      </div>

      {mode === "edit" ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <label className="text-xs font-medium text-slate-600">
            Estado del insumo
          </label>
          <div className="flex rounded-full bg-slate-100 p-1">
            {(["ACTIVE", "INACTIVE"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={cn(
                  "flex-1 rounded-full py-2 text-xs font-semibold",
                  status === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500",
                )}
              >
                {value === "ACTIVE" ? "Activo" : "Inactivo"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] text-sky-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Los resultados mostrados son informativos. El backend recalculará la
          conversión al confirmar cada compra.
        </p>
      </div>
    </div>
  );

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !canSubmit ||
          !stockUnit ||
          !selectedPurchaseUnit ||
          factorToBaseUnit === null ||
          minStockBase === null
        )
          return;
        const normalizedInner = normalizeDecimal(innerQuantity);
        const normalizedContent = normalizeDecimal(contentQuantity);
        const values: IngredientFormValues = {
          name: name.trim(),
          stockUnitId,
          defaultPurchaseUnitId: isCommercial ? stockUnitId : purchaseUnitId,
          consumptionUnit: LEGACY_UNIT_BY_CODE[stockUnit.code] ?? "UNIT",
          purchaseUnit:
            LEGACY_UNIT_BY_CODE[selectedPurchaseUnit.code] ?? "UNIT",
          purchaseToConsumptionFactor: decimalPayload(factorToBaseUnit),
          minStock: decimalPayload(minStockBase),
          ...(isCommercial
            ? {
                purchasePresentationDraft: {
                  name: presentationName,
                  purchaseUnitId,
                  innerQuantity: normalizedInner,
                  innerUnitLabel: innerUnitLabel.trim(),
                  contentQuantity: normalizedContent,
                  contentUnitId,
                  isDefault: true,
                  isActive: true,
                },
              }
            : {}),
          ...(mode === "edit" ? { status } : {}),
        };
        void onSubmit(values);
      }}
      className={cn(
        "space-y-5",
        mode === "create" && !hideTitle && "flex h-full flex-col",
      )}
    >
      {mode === "create" && !hideTitle ? (
        <h2 className="text-lg font-semibold text-slate-900">
          Nuevo ingrediente
        </h2>
      ) : null}
      {fields}
      {!hideSubmitButton ? (
        onCancel ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-600"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="h-12 rounded-2xl bg-slate-900 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting
                ? "Guardando..."
                : mode === "create"
                  ? "Crear"
                  : "Guardar"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="h-12 w-full rounded-2xl bg-slate-900 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting
              ? "Guardando..."
              : mode === "create"
                ? "Crear ingrediente"
                : "Guardar cambios"}
          </button>
        )
      ) : null}
    </form>
  );
}
