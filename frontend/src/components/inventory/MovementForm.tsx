"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { Ingredient } from "@/src/services/inventory";
import {
  registerInitial,
  registerNegativeAdjustment,
  registerPositiveAdjustment,
  registerPurchase,
} from "@/src/services/inventory";
import { getErrorMessage } from "@/src/lib/errors";
import { cn } from "@/src/lib/utils";

export type MovementAction = "INITIAL" | "PURCHASE" | "ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE";

const ACTIONS: Array<{ label: string; value: MovementAction }> = [
  { label: "Inicial", value: "INITIAL" },
  { label: "Compra", value: "PURCHASE" },
  { label: "Ajuste +", value: "ADJUSTMENT_POSITIVE" },
  { label: "Ajuste -", value: "ADJUSTMENT_NEGATIVE" },
];

type Props = {
  ingredient: Ingredient;
  onSuccess?: () => void;
};

function toNumber(value: string) {
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export function MovementForm({ ingredient, onSuccess }: Props) {
  const [action, setAction] = useState<MovementAction>("PURCHASE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [detail, setDetail] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsUnitCost = action === "INITIAL" || action === "PURCHASE";
  const allowsUnitCost = action === "INITIAL" || action === "PURCHASE" || action === "ADJUSTMENT_POSITIVE";
  const needsDetail = action === "ADJUSTMENT_POSITIVE" || action === "ADJUSTMENT_NEGATIVE";
  const allowsReferenceId = action === "PURCHASE";

  const parsedQuantity = useMemo(() => toNumber(quantity), [quantity]);
  const parsedUnitCost = useMemo(() => toNumber(unitCost), [unitCost]);

  const canSubmit = useMemo(() => {
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return false;
    if (needsUnitCost && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)) return false;
    if (needsDetail && !detail.trim()) return false;
    return true;
  }, [parsedQuantity, parsedUnitCost, needsUnitCost, needsDetail, detail]);

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
          quantity: parsedQuantity,
          unitCost: parsedUnitCost,
          detail: detail.trim() || undefined,
        });
      } else if (action === "PURCHASE") {
        await registerPurchase({
          ingredientId: ingredient.id,
          quantity: parsedQuantity,
          unitCost: parsedUnitCost,
          referenceId: referenceId.trim() || undefined,
          detail: detail.trim() || undefined,
        });
      } else if (action === "ADJUSTMENT_POSITIVE") {
        await registerPositiveAdjustment({
          ingredientId: ingredient.id,
          quantity: parsedQuantity,
          unitCost: Number.isFinite(parsedUnitCost) ? parsedUnitCost : undefined,
          detail: detail.trim(),
        });
      } else {
        await registerNegativeAdjustment({
          ingredientId: ingredient.id,
          quantity: parsedQuantity,
          detail: detail.trim(),
        });
      }

      toast.dismiss(loadingId);
      toast.success("Movimiento registrado", { id: successId, duration: 2200 });
      setQuantity("");
      setUnitCost("");
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
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Movimiento manual
          </p>
          <p className="mt-1 text-sm font-bold text-neutral-900">
            {ingredient.name}
          </p>
        </div>
        <span className="rounded-full border border-neutral-100 bg-neutral-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {ingredient.consumptionUnit}
        </span>
      </div>

      <div className="mt-4 flex rounded-full bg-neutral-100 p-1">
        {ACTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setAction(opt.value)}
            className={cn(
              "flex-1 rounded-full py-2 text-[11px] font-black transition",
              action === opt.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Cantidad ({ingredient.consumptionUnit})
          </label>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Costo unit.
          </label>
          <input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9.,]/g, ""))}
            inputMode="decimal"
            placeholder={allowsUnitCost ? (needsUnitCost ? "0" : "(opcional)") : "No aplica"}
            disabled={!allowsUnitCost}
            className={cn(
              "w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none shadow-sm",
              allowsUnitCost
                ? "border-neutral-100 bg-white focus:border-emerald-500"
                : "border-neutral-100 bg-neutral-50 text-neutral-400",
            )}
          />
          {action === "ADJUSTMENT_POSITIVE" && (
            <p className="text-[11px] font-medium text-neutral-400">
              Si lo dejas vac&iacute;o, se usar&aacute; el costo promedio actual.
            </p>
          )}
        </div>
      </div>

      {allowsReferenceId && (
        <div className="mt-4 space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Referencia (opcional)
          </label>
          <input
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="Ej: factura 0001-000123"
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
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
                : "Ej: reposici\u00F3n semanal"
          }
          className={cn(
            "w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500",
            needsDetail && !detail.trim() ? "border-rose-200" : "border-neutral-100",
          )}
        />
        {action === "ADJUSTMENT_NEGATIVE" && (
          <p className="text-[11px] font-medium text-neutral-400">
            El ajuste negativo requiere un detalle/motivo.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit || submitting}
        className="mt-5 h-12 w-full rounded-2xl bg-neutral-900 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "Enviando..." : "Confirmar movimiento"}
      </button>
    </div>
  );
}

