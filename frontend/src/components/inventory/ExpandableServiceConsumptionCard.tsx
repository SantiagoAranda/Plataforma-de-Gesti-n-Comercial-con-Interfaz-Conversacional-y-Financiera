"use client";

import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { ChevronUp, Plus, Trash2, AlertTriangle, History, Layers3 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import {
  replaceServiceConsumption,
  type ServiceConsumptionItem,
  type ServiceIngredientLine,
  type InventorySummaryIngredient,
} from "@/src/services/inventory";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { getErrorMessage } from "@/src/lib/errors";
import { ConsumptionHistoryTab } from "./ConsumptionHistoryTab";
import { ProfitSimulator } from "./ProfitSimulator";

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
  return formatQuantityCompact(value);
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
  const serviceInitial = service.name?.trim().split(/\s+/)[0]?.charAt(0).toUpperCase() ?? "S";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 border-t-4 border-t-[#0b3f64] bg-white shadow-xs transition hover:shadow-sm">
      {/* CARD HEADER */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 bg-gradient-to-b from-slate-50/80 to-white p-4 text-left select-none"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600 shadow-inner">
          {serviceInitial}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-slate-800">
            {service.name}
          </h3>
          <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-medium text-black sm:text-[10px]", displayStatus.tone)}>
            {displayStatus.label}
          </span>
          <span className="shrink-0 rounded-lg p-1.5 text-black transition-colors">
            <ChevronUp className={cn("w-5 h-5 transition-transform duration-200", !isExpanded && "rotate-180")} />
          </span>
        </div>
      </button>

      {/* METRICS GRID */}
      <section className="border-t border-slate-100 px-4 py-3">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#0b3f64]/30 bg-[rgba(11,63,100,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
          <span className="block truncate text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black">Venta</span>
          <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
            ${formatMoney(price)}
          </span>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#ff0041]/30 bg-[rgba(255,0,65,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
          <span className="block text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black leading-tight">Costo base</span>
          <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
            {displayCost === null ? "—" : `$${formatMoney(displayCost)}`}
          </span>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#00963d]/30 bg-[rgba(0,150,61,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
          <span className="block text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black leading-tight">Ganancia base</span>
          <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
            {displayMargin === null ? "—" : `$${formatMoney(displayMargin)}`}
          </span>
        </div>
        </div>
      </section>

      {/* EXPANDED CONTENT */}
      {isExpanded && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <ProfitSimulator cost={displayCost} />
          {/* Sub-tabs header */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2 select-none">
            <button
              type="button"
              onClick={() => setActiveSubTab("config")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                activeSubTab === "config"
                  ? "bg-[#0b3f64] text-white shadow-xs"
                  : "border border-slate-200 bg-white text-black hover:bg-slate-50"
              )}
            >
              <Layers3 className="h-3.5 w-3.5 shrink-0" />
              Insumos usados
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("history")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                activeSubTab === "history"
                  ? "bg-[#0b3f64] text-white shadow-xs"
                  : "border border-slate-200 bg-white text-black hover:bg-slate-50"
              )}
            >
              <History className="h-3.5 w-3.5 shrink-0" />
              Historial de Consumo
            </button>
          </div>

          {activeSubTab === "history" ? (
            <ConsumptionHistoryTab itemId={service.id} itemName={service.name} type="service" />
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
                        className="rounded-2xl border-y border-r border-l-4 border-l-amber-400 border-slate-100 bg-neutral-50 p-3 pl-4 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                            <h4 className="truncate text-neutral-800 text-sm font-medium">
                              {getIngredientName(line.ingredientId)}
                            </h4>
                            <div className="text-neutral-500 text-xs font-mono bg-neutral-100 px-2 py-0.5 rounded-md shrink-0">
                              {line.quantityRequired} {unitLabel}
                            </div>
                          </div>
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
