"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import toast from "react-hot-toast";

import type { Ingredient } from "@/src/services/inventory";
import {
  registerInitial,
  registerNegativeAdjustment,
  registerPositiveAdjustment,
  registerPurchase,
  registerPurchaseReturn,
} from "@/src/services/inventory";
import { getErrorMessage } from "@/src/lib/errors";
import { cn } from "@/src/lib/utils";
import { formatIngredientUnit, formatUnit } from "@/src/components/inventory/unitLabels";

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
  { label: "Ajuste -", value: "ADJUSTMENT_NEGATIVE" },
];

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

function isValidDecimalString(value: string) {
  return /^\d+(\.\d+)?$/.test(value);
}

function toDisplayNumber(value: string) {
  const normalized = normalizeDecimalInput(value);
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
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
  const [detail, setDetail] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsUnitCost =
    action === "INITIAL" ||
    action === "PURCHASE" ||
    action === "PURCHASE_RETURN" ||
    action === "ADJUSTMENT_POSITIVE";
  const allowsUnitCost = needsUnitCost;
  const needsDetail =
    action === "PURCHASE_RETURN" ||
    action === "ADJUSTMENT_POSITIVE" ||
    action === "ADJUSTMENT_NEGATIVE";
  const allowsReferenceId = action === "PURCHASE" || action === "PURCHASE_RETURN";

  useEffect(() => {
    const nextAction = initialAction ?? suggestedAction;
    setAction(nextAction === "INITIAL" && !canCreateInitial ? "PURCHASE" : nextAction);
  }, [initialAction, suggestedAction, canCreateInitial]);

  const actions = useMemo(
    () => ALL_ACTIONS.filter((item) => {
      if (item.value === "INITIAL" && !canCreateInitial) return false;
      if (disabledActions?.includes(item.value)) return false;
      return true;
    }),
    [canCreateInitial, disabledActions],
  );

  const consumptionUnitLabel = formatIngredientUnit(ingredient);
  const purchaseUnitLabel = formatUnit(ingredient.purchaseUnit);

  const normalizedQuantity = useMemo(() => normalizeDecimalInput(quantity), [quantity]);
  const normalizedUnitCost = useMemo(() => normalizeDecimalInput(unitCost), [unitCost]);
  const normalizedPurchaseQuantity = useMemo(
    () => normalizeDecimalInput(purchaseQuantity),
    [purchaseQuantity],
  );
  const normalizedPurchaseUnitCost = useMemo(
    () => normalizeDecimalInput(purchaseUnitCost),
    [purchaseUnitCost],
  );

  const parsedQuantity = useMemo(() => toDisplayNumber(quantity), [quantity]);
  const parsedUnitCost = useMemo(() => toDisplayNumber(unitCost), [unitCost]);
  const parsedPurchaseQuantity = useMemo(
    () => toDisplayNumber(purchaseQuantity),
    [purchaseQuantity],
  );
  const parsedPurchaseUnitCost = useMemo(
    () => toDisplayNumber(purchaseUnitCost),
    [purchaseUnitCost],
  );

  const purchaseFactor = useMemo(() => toDisplayNumber(ingredient.purchaseToConsumptionFactor), [ingredient.purchaseToConsumptionFactor]);
  const canShowPurchaseFormula = useMemo(() => Number.isFinite(purchaseFactor) && purchaseFactor > 0, [purchaseFactor]);

  const estimatedConsumptionQty = useMemo(() => {
    if (!canShowPurchaseFormula) return null;
    if (!Number.isFinite(parsedPurchaseQuantity) || parsedPurchaseQuantity <= 0) return null;
    return parsedPurchaseQuantity * purchaseFactor;
  }, [canShowPurchaseFormula, parsedPurchaseQuantity, purchaseFactor]);

  const estimatedUnitCostPerConsumption = useMemo(() => {
    if (!canShowPurchaseFormula) return null;
    if (!Number.isFinite(parsedPurchaseUnitCost) || parsedPurchaseUnitCost < 0) return null;
    if (!Number.isFinite(purchaseFactor) || purchaseFactor <= 0) return null;
    return parsedPurchaseUnitCost / purchaseFactor;
  }, [canShowPurchaseFormula, parsedPurchaseUnitCost, purchaseFactor]);

  const compactConversionText = useMemo(() => {
    const factorStr = `1 ${purchaseUnitLabel} = ${ingredient.purchaseToConsumptionFactor} ${consumptionUnitLabel}`;
    const conversionBase = `Conversión: ${factorStr}`;
    
    const hasQty = Number.isFinite(parsedPurchaseQuantity) && parsedPurchaseQuantity > 0;
    const hasCost = Number.isFinite(parsedPurchaseUnitCost) && parsedPurchaseUnitCost >= 0;

    if (!hasQty && !hasCost) {
      return conversionBase;
    }

    const parts = [conversionBase];
    if (canShowPurchaseFormula && estimatedConsumptionQty !== null) {
      parts.push(`Ingresan: ${estimatedConsumptionQty.toLocaleString("es-AR", { maximumFractionDigits: 6 })}`);
    }
    if (canShowPurchaseFormula && estimatedUnitCostPerConsumption !== null) {
      parts.push(`Costo unit.: $${estimatedUnitCostPerConsumption.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`);
    }

    return parts.join(" · ");
  }, [
    purchaseUnitLabel,
    ingredient.purchaseToConsumptionFactor,
    consumptionUnitLabel,
    parsedPurchaseQuantity,
    parsedPurchaseUnitCost,
    canShowPurchaseFormula,
    estimatedConsumptionQty,
    estimatedUnitCostPerConsumption,
  ]);

  const canSubmit = useMemo(() => {
    if (action === "PURCHASE") {
      if (!isValidDecimalString(normalizedPurchaseQuantity)) return false;
      if (!isValidDecimalString(normalizedPurchaseUnitCost)) return false;
      if (!Number.isFinite(parsedPurchaseQuantity) || parsedPurchaseQuantity <= 0) return false;
      if (!Number.isFinite(parsedPurchaseUnitCost) || parsedPurchaseUnitCost < 0) return false;
    } else {
      if (!isValidDecimalString(normalizedQuantity)) return false;
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return false;
      if (needsUnitCost) {
        if (!isValidDecimalString(normalizedUnitCost)) return false;
        if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) return false;
      }
    }
    if (needsDetail && !detail.trim()) return false;
    return true;
  }, [
    action,
    normalizedPurchaseQuantity,
    normalizedPurchaseUnitCost,
    parsedPurchaseQuantity,
    parsedPurchaseUnitCost,
    normalizedQuantity,
    normalizedUnitCost,
    parsedQuantity,
    parsedUnitCost,
    needsUnitCost,
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
          quantity: normalizedQuantity,
          unitCost: normalizedUnitCost,
          detail: detail.trim() || undefined,
        });
      } else if (action === "PURCHASE") {
        await registerPurchase({
          ingredientId: ingredient.id,
          purchaseQuantity: normalizedPurchaseQuantity,
          purchaseUnitCost: normalizedPurchaseUnitCost,
          referenceId: referenceId.trim() || undefined,
          detail: detail.trim() || undefined,
        });
      } else if (action === "PURCHASE_RETURN") {
        await registerPurchaseReturn({
          ingredientId: ingredient.id,
          quantity: normalizedQuantity,
          unitCost: normalizedUnitCost,
          referenceId: referenceId.trim() || undefined,
          detail: detail.trim() || undefined,
        });
      } else if (action === "ADJUSTMENT_POSITIVE") {
        await registerPositiveAdjustment({
          ingredientId: ingredient.id,
          quantity: normalizedQuantity,
          unitCost: normalizedUnitCost,
          detail: detail.trim(),
        });
      } else {
        await registerNegativeAdjustment({
          ingredientId: ingredient.id,
          quantity: normalizedQuantity,
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
        if (canSubmit && !submitting) {
          void submit();
        }
      }}
      className={cn("space-y-4", !compact && "rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5")}
    >
      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Movimiento manual
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {ingredient.name}
            </p>
          </div>
          <span className="rounded-full border border-neutral-100 bg-neutral-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            {consumptionUnitLabel}
          </span>
        </div>
      )}

      {canCreateInitial && !compact ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[11px] font-semibold text-emerald-900">
          Este insumo no tiene movimientos. La carga inicial aparece como primera acci&oacute;n sugerida.
        </div>
      ) : null}

      {!compact && (
        <div className="mt-4 flex rounded-full bg-neutral-100 p-1">
          {actions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAction(opt.value)}
              className={cn(
                "flex-1 rounded-full py-2 text-[11px] font-semibold transition",
                action === opt.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {action === "PURCHASE" ? (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Cantidad comprada ({purchaseUnitLabel})
              </label>
              <input
                value={purchaseQuantity}
                onChange={(e) => setPurchaseQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Costo por {purchaseUnitLabel}
              </label>
              <input
                value={purchaseUnitCost}
                onChange={(e) => setPurchaseUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
              />
            </div>

            {compact ? (
              <div className="col-span-2 text-xs font-medium text-slate-400/80 px-1 py-0.5">
                {compactConversionText}
              </div>
            ) : (
              <div className="col-span-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-[11px] font-medium text-neutral-500">
                <p>
                  El sistema convierte esta compra a {consumptionUnitLabel} usando el factor configurado:{" "}
                  <span className="font-semibold text-slate-700">
                    1 {purchaseUnitLabel} = {ingredient.purchaseToConsumptionFactor} {consumptionUnitLabel}
                  </span>
                  .
                </p>
                {canShowPurchaseFormula && estimatedConsumptionQty !== null && (
                  <p className="mt-1">
                    Ingresarán aprox.{" "}
                    <span className="font-semibold text-slate-700">
                      {estimatedConsumptionQty.toLocaleString("es-AR", { maximumFractionDigits: 6 })} {consumptionUnitLabel}
                    </span>
                    .
                  </p>
                )}
                {canShowPurchaseFormula && estimatedUnitCostPerConsumption !== null && (
                  <p className="mt-1">
                    Costo estimado por {consumptionUnitLabel}:{" "}
                    <span className="font-semibold text-slate-700">
                      {estimatedUnitCostPerConsumption.toLocaleString("es-AR", { maximumFractionDigits: 6 })}
                    </span>
                    .
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Cantidad ({consumptionUnitLabel})
              </label>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Costo unit.
              </label>
              <input
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder={allowsUnitCost ? "0" : "No aplica"}
                disabled={!allowsUnitCost}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none shadow-sm",
                  allowsUnitCost
                    ? "border-neutral-100 bg-white focus:border-emerald-500"
                    : "border-neutral-100 bg-neutral-50 text-neutral-400",
                )}
              />
            </div>
          </>
        )}
      </div>

      {allowsReferenceId && (
        <div className="mt-3 space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Nro factura
          </label>
          <input
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="Ej: 0001-000123"
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500"
          />
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Detalle {needsDetail ? "(requerido)" : "(opcional)"}
        </label>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={
            action === "ADJUSTMENT_NEGATIVE"
              ? "Ej: faltante por conteo"
              : action === "ADJUSTMENT_POSITIVE"
                ? "Ej: sobrante por conteo"
                : action === "PURCHASE_RETURN"
                  ? "Ej: devolución por mercadería defectuosa"
                  : "Ej: reposici\u00F3n semanal"
          }
          className={cn(
            "w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none shadow-sm focus:border-emerald-500",
            needsDetail && !detail.trim() ? "border-rose-200" : "border-neutral-100",
          )}
        />
        {action === "PURCHASE_RETURN" && (
          <p className="text-[11px] font-medium text-neutral-400">
            La devolución de compra requiere un detalle/motivo.
          </p>
        )}
        {action === "ADJUSTMENT_NEGATIVE" && (
          <p className="text-[11px] font-medium text-neutral-400">
            El ajuste negativo requiere un detalle/motivo.
          </p>
        )}
      </div>

      {!hideSubmitButton && (
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="mt-5 h-12 w-full rounded-2xl bg-neutral-900 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Confirmar movimiento"}
        </button>
      )}
    </form>
  );
}

