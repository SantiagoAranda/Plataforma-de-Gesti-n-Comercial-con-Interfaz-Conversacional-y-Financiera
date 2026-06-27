"use client";

import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Plus, Trash2, BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import {
  replaceServiceConsumption,
  type ServiceConsumptionItem,
  type ServiceIngredientLine,
  type InventorySummaryIngredient,
} from "@/src/services/inventory";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { getErrorMessage } from "@/src/lib/errors";
import { ConsumptionHistoryTab } from "./ConsumptionHistoryTab";

type Props = {
  service: ServiceConsumptionItem;
  allIngredients: InventorySummaryIngredient[];
  onSaveSuccess: () => Promise<void>;
  initiallyExpanded?: boolean;
};

type DraftServiceIngredient = {
  ingredientId: string;
  quantityRequired: number;
  quantityInput: string;
};

function toNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = Number(String(val).replace(",", "."));
  return Number.isFinite(num) ? num : fallback;
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(6));
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(roundQuantity(value));
}

export function ExpandableServiceConsumptionCard({
  service,
  allIngredients,
  onSaveSuccess,
  initiallyExpanded = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [activeSubTab, setActiveSubTab] = useState<"config" | "history">("config");
  const [draftLines, setDraftLines] = useState<DraftServiceIngredient[]>([]);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const getIngredientDetails = (ingredientId: string) => {
    return allIngredients.find((i) => i.id === ingredientId) ?? null;
  };

  const getIngredientUnit = (ingredientId: string) => {
    const ing = getIngredientDetails(ingredientId);
    return ing ? getStockUnitSymbol(ing) : "";
  };

  const getIngredientName = (ingredientId: string) => {
    return getIngredientDetails(ingredientId)?.name ?? "Desconocido";
  };

  const normalizeLine = (line: ServiceIngredientLine): DraftServiceIngredient => {
    const qty = roundQuantity(toNumber(line.quantityRequired, 1));
    return {
      ingredientId: line.ingredientId,
      quantityRequired: qty,
      quantityInput: formatQuantity(qty),
    };
  };

  // Sync draft lines when props change
  useEffect(() => {
    setDraftLines(service.ingredients.map((line) => normalizeLine(line)));
  }, [service, isExpanded]);

  // Cost calculations
  const calculateCost = (lines: DraftServiceIngredient[]) => {
    if (!lines.length) return null;

    let hasInvalid = false;
    const cost = lines.reduce((acc, line) => {
      const qty = toNumber(line.quantityRequired, 0);
      const ing = getIngredientDetails(line.ingredientId);
      const avgCost = toNumber(ing?.averageCost, 0);

      if (!line.ingredientId || !Number.isFinite(qty) || qty <= 0 || !ing) {
        hasInvalid = true;
      }
      return acc + (Number.isFinite(qty) && Number.isFinite(avgCost) ? qty * avgCost : 0);
    }, 0);

    return hasInvalid ? null : cost;
  };

  const price = typeof service.price === "number" ? service.price : Number(service.price ?? 0);

  // Original state metrics
  const originalCost = useMemo(() => {
    const originalDraft = service.ingredients.map((line) => normalizeLine(line));
    return calculateCost(originalDraft);
  }, [service.ingredients, allIngredients]);

  const originalMargin = useMemo(() => {
    return originalCost === null || !Number.isFinite(price) ? null : price - originalCost;
  }, [originalCost, price]);

  // Current draft state metrics
  const draftCost = useMemo(() => calculateCost(draftLines), [draftLines, allIngredients]);
  const draftMargin = useMemo(() => {
    return draftCost === null || !Number.isFinite(price) ? null : price - draftCost;
  }, [draftCost, price]);

  // Status pill config
  const getStatus = (lines: DraftServiceIngredient[]) => {
    if (!lines.length) {
      return { label: "SIN INSUMOS", tone: "bg-rose-50 text-rose-700 border border-rose-100" };
    }
    const hasInvalid = lines.some((l) => !l.ingredientId || l.quantityRequired <= 0);
    if (hasInvalid) {
      return { label: "INCOMPLETO", tone: "bg-amber-50 text-amber-700 border border-amber-100" };
    }
    return { label: "CONSUMO CONFIGURADO", tone: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  };

  const status = getStatus(service.ingredients.map((l) => normalizeLine(l)));
  const currentStatus = getStatus(draftLines);

  // Dirty state checker
  const isDirty = useMemo(() => {
    if (draftLines.length !== service.ingredients.length) return true;
    for (let i = 0; i < service.ingredients.length; i++) {
      const o = service.ingredients[i];
      const d = draftLines[i];
      if (!d) return true;
      if (o.ingredientId !== d.ingredientId) return true;
      if (toNumber(o.quantityRequired) !== d.quantityRequired) return true;
    }
    return false;
  }, [service.ingredients, draftLines]);

  const availableIngredients = useMemo(() => {
    const usedIds = new Set(draftLines.map((line) => line.ingredientId).filter(Boolean));
    return allIngredients.filter(
      (ing) => ing.status !== "INACTIVE" && !usedIds.has(ing.id)
    );
  }, [allIngredients, draftLines]);

  const updateQuantity = (idx: number, val: number) => {
    const cleanVal = roundQuantity(toNumber(val, 0));
    if (cleanVal <= 0) return;

    setDraftLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        return {
          ...line,
          quantityRequired: cleanVal,
          quantityInput: formatQuantity(cleanVal),
        };
      })
    );
  };

  const updateQuantityInput = (idx: number, value: string) => {
    setDraftLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const normalized = value.replace(",", ".");
        const numericValue = toNumber(normalized, NaN);

        let baseQty = line.quantityRequired;
        if (normalized.trim() !== "" && Number.isFinite(numericValue) && numericValue > 0) {
          baseQty = roundQuantity(numericValue);
        }

        return {
          ...line,
          quantityInput: value,
          quantityRequired: baseQty,
        };
      })
    );
  };

  const handleDecrement = (idx: number, line: DraftServiceIngredient) => {
    const next = roundQuantity(line.quantityRequired - 1);
    updateQuantity(idx, next < 0.001 ? 0.001 : next);
  };

  const handleIncrement = (idx: number, line: DraftServiceIngredient) => {
    const next = roundQuantity(line.quantityRequired + 1);
    updateQuantity(idx, next);
  };

  const handleRemoveLine = (idx: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddIngredient = (ingredientId: string) => {
    if (!ingredientId) return;

    if (draftLines.some((l) => l.ingredientId === ingredientId)) {
      toast.error("El insumo ya está en la lista de consumo");
      return;
    }

    setDraftLines((prev) => [
      ...prev,
      {
        ingredientId,
        quantityRequired: 1,
        quantityInput: "1",
      },
    ]);
    setShowAddSelector(false);
  };

  const validate = () => {
    if (draftLines.length > 0) {
      for (const line of draftLines) {
        if (!line.ingredientId) return "Cada línea debe tener un insumo válido.";
        if (line.quantityRequired <= 0) return "La cantidad de cada insumo debe ser mayor a 0.";
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    const loadingId = toast.loading("Guardando configuración...");
    try {
      const payload = {
        ingredients: draftLines.map((l) => ({
          ingredientId: l.ingredientId,
          quantityRequired: roundQuantity(l.quantityRequired),
        })),
      };

      await replaceServiceConsumption(service.id, payload);
      toast.dismiss(loadingId);
      toast.success("Configuración guardada correctamente");
      setIsExpanded(false);
      await onSaveSuccess();
    } catch (error) {
      console.error(error);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(error, "No se pudo guardar la configuración"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setDraftLines(service.ingredients.map((line) => normalizeLine(line)));
    setIsExpanded(false);
  };

  const displayCost = isExpanded ? draftCost : originalCost;
  const displayMargin = isExpanded ? draftMargin : originalMargin;
  const displayStatus = isExpanded ? currentStatus : status;

  return (
    <article
      className={cn(
        "rounded-2xl bg-white border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition duration-200 hover:shadow-md overflow-hidden",
        isExpanded && "border-slate-200/80 bg-slate-50/10"
      )}
    >
      {/* CARD HEADER */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left flex items-start gap-4 select-none"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EEF2F6] text-[#475569] border border-slate-200/60 shadow-inner">
          <BookOpen className="h-5 w-5 text-indigo-500" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-slate-800 leading-tight">
              {service.name}
            </h3>
            <div className="text-slate-400 shrink-0">
              {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
            </div>
          </div>
          <div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                displayStatus.tone
              )}
            >
              {displayStatus.label}
            </span>
          </div>
        </div>
      </button>

      {/* METRICS GRID */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-50/80 pt-3 text-[10px] font-bold text-slate-400">
        <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-50 text-center">
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Precio Venta</span>
          <span className="text-slate-700 block mt-0.5 truncate text-xs font-extrabold">
            ${formatMoney(price)}
          </span>
        </div>
        <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-50 text-center">
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Costo Insumos</span>
          <span className="text-slate-700 block mt-0.5 truncate text-xs font-extrabold">
            {displayCost === null ? "—" : `$${formatMoney(displayCost)}`}
          </span>
        </div>
        <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-50 text-center">
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Ganancia Marg.</span>
          <span className={cn("block mt-0.5 truncate text-xs font-extrabold", displayMargin !== null && displayMargin >= 0 ? "text-indigo-600" : "text-rose-600")}>
            {displayMargin === null ? "—" : `$${formatMoney(displayMargin)}`}
          </span>
        </div>
      </div>

      {/* EXPANDED CONTENT */}
      {isExpanded && (
        <div className="mt-4 border-t border-slate-100/80 pt-3.5 space-y-4">
          {/* Sub-tabs header */}
          <div className="flex border-b border-slate-100 pb-2 mb-2 gap-1 select-none">
            <button
              type="button"
              onClick={() => setActiveSubTab("config")}
              className={cn(
                "pb-1.5 px-3 text-xs font-bold transition-all border-b-2 -mb-2.5",
                activeSubTab === "config"
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-450 hover:text-slate-600"
              )}
            >
              Insumos usados
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("history")}
              className={cn(
                "pb-1.5 px-3 text-xs font-bold transition-all border-b-2 -mb-2.5",
                activeSubTab === "history"
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-450 hover:text-slate-600"
              )}
            >
              Historial de Consumo
            </button>
          </div>

          {activeSubTab === "history" ? (
            <ConsumptionHistoryTab itemId={service.id} type="service" />
          ) : (
            <>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Insumos del Servicio
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddSelector(!showAddSelector);
                    }}
                    className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* ADD INGREDIENT SELECTOR INLINE */}
                {showAddSelector && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-600">
                        Seleccionar insumo para agregar
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddSelector(false)}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-700"
                      >
                        Cancelar
                      </button>
                    </div>
                    {availableIngredients.length === 0 ? (
                      <p className="text-xs font-semibold text-slate-500 py-1">
                        No hay insumos disponibles para agregar.
                      </p>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => handleAddIngredient(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400"
                      >
                        <option value="">Seleccionar insumo...</option>
                        {availableIngredients.map((ing) => {
                          const avgCost = toNumber(ing.averageCost, 0);
                          const unit = getStockUnitSymbol(ing);
                          const currentStock = toNumber(ing.currentStock, 0);
                          return (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} (${formatMoney(avgCost)}/{unit}) - Stock: {formatMoney(currentStock)}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {draftLines.map((line, idx) => {
                    const ing = getIngredientDetails(line.ingredientId);
                    const costVal = toNumber(ing?.averageCost, 0);
                    const unitLabel = getIngredientUnit(line.ingredientId);

                    return (
                      <div
                        key={`${line.ingredientId}-${idx}`}
                        className="rounded-2xl border border-slate-100 bg-white p-3 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-xs font-bold text-slate-800">
                            {getIngredientName(line.ingredientId)}
                          </h4>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-slate-400">
                            Costo prom.: ${formatMoney(costVal)} / {unitLabel}
                          </p>
                          <span className="text-[10px] font-bold text-slate-400">
                            Stock: {ing ? formatMoney(Number(ing.currentStock)) : 0} {unitLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 p-0.5 border border-slate-150">
                            <button
                              type="button"
                              disabled={line.quantityRequired <= 0.001}
                              onClick={() => handleDecrement(idx, line)}
                              className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                            >
                              -
                            </button>

                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={line.quantityInput}
                              onBlur={(e) => {
                                const val = toNumber(e.target.value, NaN);
                                updateQuantity(idx, !Number.isFinite(val) || val <= 0 ? 1 : val);
                              }}
                              onChange={(e) => {
                                updateQuantityInput(idx, e.target.value);
                              }}
                              className="w-12 bg-transparent text-center text-xs font-bold text-slate-750 outline-none"
                            />

                            <button
                              type="button"
                              onClick={() => handleIncrement(idx, line)}
                              className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-[11px] font-bold text-slate-400 select-none">
                            {unitLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {draftLines.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
                    Este servicio no consume insumos internos registrados.
                  </div>
                )}
              </div>

              {isDirty && (
                <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 active:scale-[0.98]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={submitting}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
                  >
                    {submitting ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
