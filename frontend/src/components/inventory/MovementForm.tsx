"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import toast from "react-hot-toast";
import { Scale, FileText, Hash } from "lucide-react";

import type { Ingredient, Unit } from "@/src/services/inventory";
import {
  listUnits,
  registerInitial,
  registerNegativeAdjustment,
  registerPositiveAdjustment,
  registerPurchase,
  registerPurchaseReturn,
} from "@/src/services/inventory";
import { getErrorMessage } from "@/src/lib/errors";
import { cn } from "@/src/lib/utils";
import {
  getStandardPurchasePreview,
  getStockUnitSymbol,
  formatUnitSymbol,
  type UnitConversionLike,
} from "@/src/components/inventory/inventoryUnits";
import { formatMoney } from "@/src/lib/formatters";
import { api } from "@/src/lib/api";

export type MovementAction =
  | "INITIAL"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE";

const ALL_ACTIONS: Array<{ label: string; value: MovementAction }> = [
  { label: "Inicial", value: "INITIAL" },
  { label: "Compra", value: "PURCHASE" },
  { label: "Dev. compra", value: "PURCHASE_RETURN" },
  { label: "Ajuste +", value: "ADJUSTMENT_POSITIVE" },
  { label: "Ajuste −", value: "ADJUSTMENT_NEGATIVE" },
];

const PURCHASE_UNIT_CODES_BY_STOCK: Record<string, string[]> = {
  UNIT: ["UNIT", "PACKAGE", "DOZEN", "BOX"],
  G: ["G", "KG", "LB"],
  ML: ["ML", "L"],
};

type Props = {
  ingredient: Ingredient;
  onSuccess?: () => void;
  initialAction?: MovementAction;
  disabledActions?: MovementAction[];
  compact?: boolean;
  hideSubmitButton?: boolean;
  onValidationChange?: (isValid: boolean) => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  formRef?: RefObject<HTMLFormElement | null>;
};

function normalizeDecimalInput(value: string) {
  return value.trim().replace(",", ".");
}

function isPositiveDecimal(value: string) {
  const normalized = normalizeDecimalInput(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return false;
  return Number(normalized) > 0;
}

export function MovementForm({
  ingredient,
  onSuccess,
  initialAction,
  disabledActions,
  compact = false,
  hideSubmitButton = false,
  onValidationChange,
  onSubmittingChange,
  formRef,
}: Props) {
  const canCreateInitial = ingredient.canCreateInitialInventory ?? !ingredient.hasMovements;
  const suggestedAction = canCreateInitial ? "INITIAL" : "PURCHASE";
  const [action, setAction] = useState<MovementAction>(initialAction ?? suggestedAction);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchaseUnitCost, setPurchaseUnitCost] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversions, setConversions] = useState<UnitConversionLike[]>([]);
  const [detail, setDetail] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stockUnit = useMemo(
    () =>
      ingredient.stockUnit ??
      units.find((unit) => unit.id === ingredient.stockUnitId) ??
      units.find((unit) => unit.code === ingredient.consumptionUnit) ??
      null,
    [ingredient.stockUnit, ingredient.stockUnitId, ingredient.consumptionUnit, units],
  );
  const stockUnitId = ingredient.stockUnitId ?? stockUnit?.id ?? null;
  const stockUnitCode = stockUnit?.code ?? ingredient.consumptionUnit ?? "";
  const ingredientWithStockUnit = useMemo(
    () => ({ ...ingredient, stockUnit, stockUnitId }),
    [ingredient, stockUnit, stockUnitId],
  );
  const usesUnitModel = Boolean(stockUnit && stockUnitId);
  const stockUnitLabel = stockUnit?.symbol ?? getStockUnitSymbol(ingredient);

  /**
   * Filter units to show only those that have a valid conversion to the
   * ingredient's stock unit. This includes the stock unit itself plus
   * any unit (KG, LB, BOX, DOZEN, PACKAGE, etc.) that has a conversion
   * entry in UnitConversion → stockUnitId.
   */
  const purchaseUnits = useMemo(() => {
    if (!stockUnit) return [];
    const allowedCodes = PURCHASE_UNIT_CODES_BY_STOCK[stockUnit.code] ?? [stockUnit.code];

    const compatibleFromIds = new Set(
      conversions
        .filter((c) => c.toUnitId === stockUnitId || c.toUnit?.id === stockUnitId || c.toUnit?.code === stockUnit.code)
        .map((c) => c.fromUnitId ?? c.fromUnit?.id)
        .filter(Boolean) as string[],
    );
    const compatibleFromCodes = new Set(
      conversions
        .filter((c) => c.toUnitId === stockUnitId || c.toUnit?.id === stockUnitId || c.toUnit?.code === stockUnit.code)
        .map((c) => c.fromUnit?.code)
        .filter(Boolean) as string[],
    );

    return units.filter((unit) => {
      if (!allowedCodes.includes(unit.code)) return false;
      if (unit.id === stockUnitId || unit.code === stockUnit.code) return true;
      return compatibleFromIds.has(unit.id) || compatibleFromCodes.has(unit.code);
    });
  }, [units, conversions, stockUnit, stockUnitId]);

  const selectedPurchaseUnit =
    purchaseUnits.find((unit) => unit.id === purchaseUnitId) ??
    ingredient.defaultPurchaseUnit ??
    purchaseUnits.find((unit) => unit.id === ingredient.defaultPurchaseUnitId) ??
    purchaseUnits.find((unit) => unit.code === ingredient.purchaseUnit) ??
    null;

  const purchaseUnitLabel = selectedPurchaseUnit?.symbol ?? ingredient.defaultPurchaseUnit?.symbol ?? "";

  const needsUnitCost =
    action === "INITIAL" ||
    action === "PURCHASE" ||
    action === "PURCHASE_RETURN" ||
    action === "ADJUSTMENT_POSITIVE";
  const needsDetail =
    action === "PURCHASE_RETURN" ||
    action === "ADJUSTMENT_POSITIVE" ||
    action === "ADJUSTMENT_NEGATIVE";
  const allowsReferenceId = action === "PURCHASE" || action === "PURCHASE_RETURN";

  useEffect(() => {
    const nextAction = initialAction ?? suggestedAction;
    setAction(nextAction === "INITIAL" && !canCreateInitial ? "PURCHASE" : nextAction);
  }, [initialAction, suggestedAction, canCreateInitial]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedUnits, loadedConversions] = await Promise.all([
          listUnits(),
          api<UnitConversionLike[]>("/inventory/unit-conversions"),
        ]);
        console.log("[inventory units]", loadedUnits.map((unit) => unit.code));
        setUnits(loadedUnits);
        setConversions(loadedConversions);
      } catch (error) {
        console.error(error);
        toast.error("No se pudieron cargar las unidades");
      }
    };
    void loadData();
  }, []);

  useEffect(() => {
    const fallbackUnit =
      purchaseUnits.find((unit) => unit.id === ingredient.defaultPurchaseUnitId) ??
      purchaseUnits.find((unit) => unit.code === ingredient.purchaseUnit) ??
      purchaseUnits[0] ??
      null;
    setPurchaseUnitId(fallbackUnit?.id ?? "");
  }, [ingredient.defaultPurchaseUnitId, ingredient.purchaseUnit, purchaseUnits]);

  const actions = useMemo(
    () => ALL_ACTIONS.filter((item) => {
      if (item.value === "INITIAL" && !canCreateInitial) return false;
      if (disabledActions?.includes(item.value)) return false;
      return true;
    }),
    [canCreateInitial, disabledActions],
  );

  const preview = useMemo(() => {
    if (!usesUnitModel) {
      return {
        valid: false,
        lines: ["Este insumo requiere migración al modelo de unidades antes de registrar compras."],
        stockQuantityAdded: null,
        baseUnitCost: null,
        purchaseUnitLabel: "",
        stockUnitLabel: "",
      };
    }

    return getStandardPurchasePreview({
      ingredient: ingredientWithStockUnit,
      purchaseUnit: selectedPurchaseUnit,
      quantity: purchaseQuantity,
      unitCost: purchaseUnitCost,
      conversions,
    });
  }, [usesUnitModel, ingredientWithStockUnit, selectedPurchaseUnit, purchaseQuantity, purchaseUnitCost, conversions]);

  const canSubmit = useMemo(() => {
    if (action === "PURCHASE") {
      if (!isPositiveDecimal(purchaseQuantity)) return false;
      if (!isPositiveDecimal(purchaseUnitCost)) return false;
      if (!usesUnitModel || !preview.valid) return false;
      if (!selectedPurchaseUnit?.id) return false;
    } else {
      if (!isPositiveDecimal(quantity)) return false;
      if (needsUnitCost && !isPositiveDecimal(unitCost)) return false;
    }
    if (needsDetail && !detail.trim()) return false;
    return true;
  }, [
    action,
    purchaseQuantity,
    purchaseUnitCost,
    usesUnitModel,
    preview.valid,
    selectedPurchaseUnit?.id,
    quantity,
    needsUnitCost,
    unitCost,
    needsDetail,
    detail,
  ]);

  useEffect(() => {
    onValidationChange?.(canSubmit);
  }, [canSubmit, onValidationChange]);

  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [submitting, onSubmittingChange]);

  const submit = async () => {
    const loadingId = "inventory-movement-loading";
    const successId = "inventory-movement-success";
    const errorId = "inventory-movement-error";

    try {
      setSubmitting(true);
      toast.dismiss(errorId);
      toast.dismiss(successId);
      toast.loading("Registrando movimiento...", { id: loadingId });

      if (action === "INITIAL") {
        await registerInitial({
          ingredientId: ingredient.id,
          quantity: normalizeDecimalInput(quantity),
          unitCost: normalizeDecimalInput(unitCost),
          detail: detail.trim() || undefined,
        });
      } else if (action === "PURCHASE") {
        await registerPurchase({
          ingredientId: ingredient.id,
          purchaseQuantity: normalizeDecimalInput(purchaseQuantity),
          purchaseUnitCost: normalizeDecimalInput(purchaseUnitCost),
          purchaseUnitId: selectedPurchaseUnit?.id,
          referenceId: referenceId.trim() || undefined,
          detail: detail.trim() || undefined,
        });
      } else if (action === "PURCHASE_RETURN") {
        await registerPurchaseReturn({
          ingredientId: ingredient.id,
          quantity: normalizeDecimalInput(quantity),
          unitCost: normalizeDecimalInput(unitCost),
          referenceId: referenceId.trim() || undefined,
          detail: detail.trim() || undefined,
        });
      } else if (action === "ADJUSTMENT_POSITIVE") {
        await registerPositiveAdjustment({
          ingredientId: ingredient.id,
          quantity: normalizeDecimalInput(quantity),
          unitCost: normalizeDecimalInput(unitCost),
          detail: detail.trim(),
        });
      } else {
        await registerNegativeAdjustment({
          ingredientId: ingredient.id,
          quantity: normalizeDecimalInput(quantity),
          detail: detail.trim(),
        });
      }

      toast.dismiss(loadingId);
      toast.success("Movimiento registrado", { id: successId, duration: 2200 });
      setQuantity("");
      setUnitCost("");
      setPurchaseQuantity("");
      setPurchaseUnitCost("");
      setDetail("");
      setReferenceId("");
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(error, "No se pudo registrar el movimiento"), {
        id: errorId,
        duration: 4500,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !submitting) void submit();
      }}
      className={cn("space-y-5", !compact && "rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5")}
    >
      {!compact && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Movimiento manual</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{ingredient.name}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {stockUnitLabel}
          </span>
        </div>
      )}

      {canCreateInitial && !compact ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-950 shadow-sm">
          Este insumo no tiene movimientos. La carga inicial aparece como primera acción sugerida.
        </div>
      ) : null}

      {!compact && (
        <div className="flex rounded-full bg-slate-100 p-1 ring-1 ring-black/5">
          {actions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAction(opt.value)}
              className={cn(
                "flex-1 rounded-full py-2 text-xs font-semibold transition active:scale-[0.98]",
                action === opt.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {action === "PURCHASE" ? (
          <>
            {/* Purchase unit selector – shows only units convertible to stock unit */}
            <div className="col-span-2 space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Comprás por</label>
              <div className="relative">
                <select
                  value={purchaseUnitId || ingredient.defaultPurchaseUnitId || ""}
                  onChange={(e) => setPurchaseUnitId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                >
                  <option value="">Seleccionar...</option>
                  {purchaseUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.symbol})
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <Scale className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="space-y-2 col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Cant. comprada
              </label>
              <div className="relative flex items-center">
                <input
                  value={purchaseQuantity}
                  onChange={(e) => setPurchaseQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-4 pr-12 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">
                  {purchaseUnitLabel || "-"}
                </span>
              </div>
            </div>

            <div className="space-y-2 col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Costo por {purchaseUnitLabel || "unidad"}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-xs font-bold text-slate-400">$</span>
                <input
                  value={purchaseUnitCost}
                  onChange={(e) => setPurchaseUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-8 pr-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                />
              </div>
            </div>

            {preview.valid ? (
              <div className="col-span-2 rounded-[20px] bg-emerald-50/90 border border-emerald-100 p-4 shadow-sm space-y-3 transition animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-800">
                    <Scale className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Conversión a stock</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-emerald-200/40">
                  <div>
                    <p className="text-[9px] font-bold text-emerald-600/80 uppercase tracking-wide">Ingreso a Stock</p>
                    <p className="text-base font-bold text-emerald-900">
                      +{preview.stockQuantityAdded !== null ? formatMoney(preview.stockQuantityAdded) : "0"} {preview.stockUnitLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-emerald-600/80 uppercase tracking-wide">Costo Kardex / {preview.stockUnitLabel}</p>
                    <p className="text-base font-bold text-emerald-900">
                      ${preview.baseUnitCost !== null ? formatMoney(preview.baseUnitCost) : "0"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/60 p-2.5 text-[11px] font-semibold text-emerald-950/90 space-y-1">
                  {preview.lines.map((line, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="col-span-2 rounded-[20px] bg-rose-50 border border-rose-100 p-4 shadow-sm text-xs font-semibold text-rose-800">
                {preview.lines.join(". ")}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2 col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Cantidad
              </label>
              <div className="relative flex items-center">
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-white pl-4 pr-12 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">
                  {stockUnitLabel || formatUnitSymbol(stockUnitCode)}
                </span>
              </div>
            </div>

            <div className="space-y-2 col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Costo unit.</label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-xs font-bold text-slate-400">$</span>
                <input
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal"
                  placeholder={needsUnitCost ? "0" : "No aplica"}
                  disabled={!needsUnitCost}
                  className={cn(
                    "w-full rounded-2xl border pl-8 pr-4 py-3 text-sm font-semibold outline-none shadow-sm",
                    needsUnitCost
                      ? "border-slate-200 bg-white text-slate-800 focus:border-emerald-500"
                      : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed",
                  )}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {allowsReferenceId && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nro factura</label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-slate-400">
              <FileText className="h-4 w-4" />
            </span>
            <input
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="Ej: 0001-000123"
              className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Detalle {needsDetail ? "(requerido)" : "(opcional)"}
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-4 text-slate-400">
            <Hash className="h-4 w-4" />
          </span>
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ej: reposición semanal"
            className={cn(
              "w-full rounded-2xl border pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500",
              needsDetail && !detail.trim() ? "border-rose-200" : "border-slate-200",
            )}
          />
        </div>
      </div>

      {!hideSubmitButton && (
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="h-12 w-full rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Confirmar movimiento"}
        </button>
      )}
    </form>
  );
}
