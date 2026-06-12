"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Power, Trash2, X } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatIngredientUnit } from "@/src/components/inventory/unitLabels";

import {
  deactivateIngredient,
  getIngredient,
  listKardex,
  updateIngredient,
  type Ingredient,
  type InventoryMovement,
} from "@/src/services/inventory";
import { IngredientForm } from "./IngredientForm";
import { MovementForm } from "./MovementForm";
import { KardexList } from "./KardexList";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

type TabType = "compras" | "kardex" | "insumo";

type Props = {
  ingredientId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function IngredientDetailSheet({
  ingredientId,
  open,
  onClose,
  onChanged,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const movementFormRef = useRef<HTMLFormElement>(null);
  const ingredientFormRef = useRef<HTMLFormElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("compras");
  const [loading, setLoading] = useState(false);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movementFormValid, setMovementFormValid] = useState(false);
  const [movementFormSubmitting, setMovementFormSubmitting] = useState(false);
  const [ingredientFormValid, setIngredientFormValid] = useState(false);

  const loadData = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const [ingData, kardexData] = await Promise.all([
        getIngredient(id),
        listKardex(id).catch(() => []),
      ]);
      setIngredient(ingData);
      setMovements(kardexData);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el detalle del ingrediente");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && ingredientId) {
      setActiveTab("compras");
      void loadData(ingredientId);
    } else {
      setIngredient(null);
      setMovements([]);
    }
  }, [open, ingredientId, loadData]);

  if (!open || !ingredientId) return null;

  const handleDeactivate = async () => {
    if (!ingredient) return;
    const ok = window.confirm(
      `¿Estás seguro de que deseas desactivar el ingrediente "${ingredient.name}"?`
    );
    if (!ok) return;

    const toastId = toast.loading("Desactivando ingrediente...");
    try {
      await deactivateIngredient(ingredient.id);
      toast.success("Ingrediente desactivado", { id: toastId });
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo desactivar el ingrediente", { id: toastId });
    }
  };

  const handleUpdate = async (values: any) => {
    if (!ingredient) return;
    setSubmitting(true);
    const toastId = toast.loading("Guardando cambios...");
    try {
      const updated = await updateIngredient(ingredient.id, {
        name: values.name,
        consumptionUnit: values.consumptionUnit,
        purchaseUnit: values.purchaseUnit,
        purchaseToConsumptionFactor: values.purchaseToConsumptionFactor,
        customUnitLabel: values.customUnitLabel,
        minStock: values.minStock,
        status: values.status,
      });
      setIngredient(updated);
      toast.success("Cambios guardados", { id: toastId });
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron guardar los cambios", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMovementSuccess = async () => {
    if (ingredientId) {
      await loadData(ingredientId);
      onChanged();
    }
  };

  const currentStock = ingredient ? parseNumber(ingredient.currentStock) : 0;
  const averageCost = ingredient ? parseNumber(ingredient.averageCost) : 0;
  const minStock = ingredient ? parseNumber(ingredient.minStock) : 0;
  const unitLabel = ingredient ? formatIngredientUnit(ingredient) : "";

  const tabs: { id: TabType; label: string }[] = [
    { id: "compras", label: "Compras" },
    { id: "kardex", label: "Kardex" },
    { id: "insumo", label: "Insumo" },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex h-[88dvh] max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl transition-transform animate-in slide-in-from-bottom sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[720px] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
        {/* HEADER */}
        <div className="shrink-0 border-b border-neutral-100 bg-white px-5 pb-4 pt-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-800 truncate">
                {loading ? "Cargando..." : ingredient?.name || "Detalle"}
              </h2>
              {ingredient && !loading ? (
                <p className="mt-1 text-xs font-normal text-slate-500 leading-tight">
                  Stock: <span className="font-medium text-slate-600">{formatMoney(currentStock)} {unitLabel}</span> · Costo prom.: <span className="font-medium text-slate-600">${formatMoney(averageCost)}</span> · Mínimo: <span className="font-medium text-slate-600">{formatMoney(minStock)} {unitLabel}</span>
                </p>
              ) : (
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider leading-none mt-1">
                  Detalle del insumo
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {ingredient && ingredient.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                  aria-label="Desactivar ingrediente"
                  title="Desactivar ingrediente"
                >
                  <Power className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* TABS SELECTOR */}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  window.requestAnimationFrame(() =>
                    contentRef.current?.scrollTo({ top: 0 })
                  );
                }}
                className={cn(
                  "flex-1 rounded-lg py-2 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <div
          ref={contentRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50/30 px-5 py-4 overscroll-contain"
        >
          {loading ? (
            <div className="py-10 text-center text-sm font-medium text-neutral-400">
              Cargando información del insumo...
            </div>
          ) : !ingredient ? (
            <div className="py-10 text-center text-sm font-medium text-neutral-400">
              No se encontró la información del insumo.
            </div>
          ) : (
            <>
              {/* TAB VIEWS */}
              {activeTab === "compras" && (
                <div className="space-y-4">
                  <MovementForm
                    formRef={movementFormRef}
                    ingredient={ingredient}
                    initialAction="PURCHASE"
                    disabledActions={["PURCHASE_RETURN", "ADJUSTMENT_POSITIVE", "ADJUSTMENT_NEGATIVE"]}
                    onSuccess={handleMovementSuccess}
                    compact={true}
                    hideSubmitButton={true}
                    onValidationChange={setMovementFormValid}
                    onSubmittingChange={setMovementFormSubmitting}
                  />
                </div>
              )}

              {activeTab === "kardex" && (
                <div className="space-y-4">
                  <KardexList movements={movements} />
                </div>
              )}

              {activeTab === "insumo" && (
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <IngredientForm
                    formRef={ingredientFormRef}
                    mode="edit"
                    initial={ingredient}
                    submitting={submitting}
                    onSubmit={handleUpdate}
                    hideSubmitButton={true}
                    hideReadOnlyMetrics={true}
                    onValidationChange={setIngredientFormValid}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* BOTTOM FIXED ACTION BAR / COMPOSER */}
        {ingredient && !loading && (
          <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3">
            <WhatsappComposer
              placeholder={
                activeTab === "compras"
                  ? "Confirmar movimiento"
                  : activeTab === "insumo"
                    ? "Guardar cambios"
                    : "Kardex"
              }
              value=""
              onChange={() => {}}
              onSubmit={() => {
                if (activeTab === "compras") {
                  if (movementFormRef.current) {
                    if (typeof movementFormRef.current.requestSubmit === "function") {
                      movementFormRef.current.requestSubmit();
                    } else {
                      movementFormRef.current.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                    }
                  }
                } else if (activeTab === "insumo") {
                  if (ingredientFormRef.current) {
                    if (typeof ingredientFormRef.current.requestSubmit === "function") {
                      ingredientFormRef.current.requestSubmit();
                    } else {
                      ingredientFormRef.current.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                    }
                  }
                }
              }}
              disabled={activeTab === "kardex"}
              isSubmitting={activeTab === "compras" ? movementFormSubmitting : submitting}
              submitDisabled={
                activeTab === "compras"
                  ? !movementFormValid
                  : activeTab === "insumo"
                    ? !ingredientFormValid
                    : true
              }
              rightIconVariant="send"
              leftIconVariant="x"
              onPlusClick={onClose}
              plusAriaLabel="Cerrar"
              submitAriaLabel={
                activeTab === "compras"
                  ? "Confirmar movimiento"
                  : activeTab === "insumo"
                    ? "Guardar cambios"
                    : "Enviar"
              }
              centerContent={
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={
                      activeTab === "compras"
                        ? "Confirmar movimiento"
                        : activeTab === "insumo"
                          ? "Guardar cambios"
                          : "Kardex"
                    }
                    className="block w-full bg-transparent text-sm font-semibold text-slate-800 outline-none cursor-default select-none animate-none"
                  />
                </div>
              }
            />
          </div>
        )}
      </div>
    </>
  );
}
