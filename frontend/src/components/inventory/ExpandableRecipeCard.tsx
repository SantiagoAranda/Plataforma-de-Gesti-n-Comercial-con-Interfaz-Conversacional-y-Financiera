"use client";

import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Plus, Trash2, BookOpen, AlertTriangle } from "lucide-react";
import { ProductCustomizationManager } from "@/src/components/inventory/ProductCustomizationManager";
import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import { replaceRecipe, type RecipeLine, type InventorySummaryIngredient } from "@/src/services/inventory";
import { ConsumptionHistoryTab } from "./ConsumptionHistoryTab";
import {
  formatRecipeConsumption,
  getStockUnitSymbol,
} from "@/src/components/inventory/inventoryUnits";
import { getErrorMessage } from "@/src/lib/errors";
import type { Item } from "@/src/types/item";

type Props = {
  item: Item;
  recipeLines: RecipeLine[];
  allIngredients: InventorySummaryIngredient[];
  onSaveSuccess: () => Promise<void>;
  initiallyExpanded?: boolean;
};

type DraftRecipeLine = RecipeLine & {
  quantityRequired: number;
  quantityInput: string;
  baseQuantityRequired: number;
  stepQuantity: number;
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

function isMeasuredIngredient(ingredient: InventorySummaryIngredient | null) {
  return ingredient !== null;
}

function inferInitialStep(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return quantity;
}

export function ExpandableRecipeCard({
  item,
  recipeLines,
  allIngredients,
  onSaveSuccess,
  initiallyExpanded = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [activeSubTab, setActiveSubTab] = useState<"config" | "history">("config");
  const [draftLines, setDraftLines] = useState<DraftRecipeLine[]>([]);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const getIngredientDetails = (ingredientId: string) => {
    return allIngredients.find((i) => i.id === ingredientId) ?? null;
  };

  const getIngredientUnit = (ingredientId: string) => {
    const ing = getIngredientDetails(ingredientId);
    return ing ? getStockUnitSymbol(ing) : "";
  };

  const getIngredientRecipeFields = (ingredientId: string) => {
    const baseUnit = getIngredientUnit(ingredientId);
    return { hasRecipeUnit: false, unitLabel: baseUnit, factor: 1, baseUnit };
  };

  const getDisplayQuantity = (line: DraftRecipeLine) => {
    return line.quantityRequired;
  };

  const normalizeLine = (line: RecipeLine, previous?: DraftRecipeLine): DraftRecipeLine => {
    const quantity = roundQuantity(toNumber(line.quantityRequired, 1));
    const step = previous?.stepQuantity && previous.stepQuantity > 0
      ? previous.stepQuantity
      : inferInitialStep(quantity);
    const base = previous?.baseQuantityRequired && previous.baseQuantityRequired > 0
      ? previous.baseQuantityRequired
      : step;

    return {
      ingredientId: line.ingredientId,
      quantityRequired: quantity,
      quantityInput: formatQuantity(quantity),
      baseQuantityRequired: base,
      stepQuantity: step,
      isOptional: !!line.isOptional,
    };
  };

  // Sync draft lines when prop or expanded state changes
  useEffect(() => {
    setDraftLines((current) =>
      recipeLines.map((line) =>
        normalizeLine(
          line,
          current.find((draftLine) => draftLine.ingredientId === line.ingredientId),
        ),
      ),
    );
  }, [recipeLines, isExpanded]);

  const isSimple = item.inventoryMode === "SIMPLE";

  const getIngredientName = (ingredientId: string) => {
    return getIngredientDetails(ingredientId)?.name ?? "Desconocido";
  };

  // Recipe calculations (realtime)
  const calculateCost = (lines: Array<RecipeLine | DraftRecipeLine>) => {
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

  // Compute values for card display
  const price = typeof item.price === "number" ? item.price : Number(item.price ?? 0);

  // Original state cost & margin (for header when closed/collapsed)
  const originalCost = useMemo(() => calculateCost(recipeLines), [recipeLines, allIngredients]);
  const originalMargin = useMemo(() => {
    return originalCost === null || !Number.isFinite(price) ? null : price - originalCost;
  }, [originalCost, price]);

  // Current draft cost & margin (for expanded state realtime update)
  const draftCost = useMemo(() => calculateCost(draftLines), [draftLines, allIngredients]);
  const draftMargin = useMemo(() => {
    return draftCost === null || !Number.isFinite(price) ? null : price - draftCost;
  }, [draftCost, price]);

  // Recipe Status Pill Logic
  const getLineQuantity = (line: RecipeLine | DraftRecipeLine) => {
    if ("quantityInput" in line && line.quantityInput.trim() !== "") {
      return toNumber(line.quantityInput, NaN);
    }
    return toNumber(line.quantityRequired, NaN);
  };

  const getRecipeStatus = (linesToCheck: Array<RecipeLine | DraftRecipeLine>) => {
    const mandatory = linesToCheck.filter((line) => !line.isOptional);
    const hasInvalid = linesToCheck.some(
      (line) =>
        !line.ingredientId ||
        !Number.isFinite(getLineQuantity(line)) ||
        getLineQuantity(line) <= 0
    );

    if (isSimple) {
      const ok = linesToCheck.length === 1 && mandatory.length === 1 && !hasInvalid;
      return ok
        ? { label: "STOCK SIMPLE", tone: "bg-sky-50 text-sky-700 border border-sky-100" }
        : { label: "SIN INSUMO", tone: "bg-rose-50 text-rose-700 border border-rose-100" };
    }

    if (!linesToCheck.length) return { label: "SIN RECETA", tone: "bg-rose-50 text-rose-700 border border-rose-100" };
    if (mandatory.length < 1 || hasInvalid) return { label: "RECETA INCOMPLETA", tone: "bg-amber-50 text-amber-700 border border-amber-100" };
    return { label: "RECETA CONFIGURADA", tone: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  };

  const status = getRecipeStatus(recipeLines);
  const currentStatus = getRecipeStatus(draftLines);

  // Determine if there are local modifications
  const isDirty = useMemo(() => {
    if (draftLines.length !== recipeLines.length) return true;
    for (let i = 0; i < recipeLines.length; i++) {
      const o = recipeLines[i];
      const d = draftLines[i];
      if (!d) return true;
      if (o.ingredientId !== d.ingredientId) return true;
      if (toNumber(o.quantityRequired) !== d.quantityRequired) return true;
      if (!!o.isOptional !== !!d.isOptional) return true;
    }
    return false;
  }, [recipeLines, draftLines]);

  // Dropdown options (active ingredients not already in draftLines)
  const availableIngredients = useMemo(() => {
    const usedIds = new Set(draftLines.map((line) => line.ingredientId).filter(Boolean));
    return allIngredients.filter(
      (ing) =>
        ing.status !== "INACTIVE" &&
        !usedIds.has(ing.id)
    );
  }, [allIngredients, draftLines]);

  // Handle quantity adjustments
  const updateQuantity = (idx: number, val: number) => {
    if (isSimple) return; // Simple is locked at qty = 1
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
    if (isSimple) return;
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
      }),
    );
  };

  const getStepQuantity = (line: DraftRecipeLine) => {
    return line.stepQuantity > 0 ? line.stepQuantity : 1;
  };

  const getMinimumQuantity = (line: DraftRecipeLine) => {
    const step = getStepQuantity(line);
    return step > 0 ? step : 1;
  };

  const handleDecrement = (idx: number, line: DraftRecipeLine) => {
    if (isSimple) return;
    const currentDisplay = getDisplayQuantity(line);
    const step = getStepQuantity(line);
    const minVal = getMinimumQuantity(line);
    const next = roundQuantity(currentDisplay - step);
    updateQuantity(idx, next < minVal ? minVal : next);
  };

  const handleIncrement = (idx: number, line: DraftRecipeLine) => {
    if (isSimple) return;
    const currentDisplay = getDisplayQuantity(line);
    const step = getStepQuantity(line);
    const newVal = roundQuantity(currentDisplay + step);
    updateQuantity(idx, newVal);
  };

  const handleRemoveLine = (idx: number) => {
    if (isSimple) return;
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddIngredient = (ingredientId: string) => {
    if (!ingredientId) return;

    if (isSimple && draftLines.length >= 1) {
      toast.error("Un producto simple no puede tener más de un insumo.");
      return;
    }

    if (draftLines.some((l) => l.ingredientId === ingredientId)) {
      toast.error("El insumo ya está en la receta");
      return;
    }

    const ing = getIngredientDetails(ingredientId);
    if (!ing) return;

    const initialQty = 1;

    setDraftLines((prev) => [
      ...prev,
      {
        ingredientId,
        quantityRequired: initialQty,
        quantityInput: "1",
        baseQuantityRequired: initialQty,
        stepQuantity: 1,
        isOptional: false,
      },
    ]);
    setShowAddSelector(false);
  };

  const validate = () => {
    if (isSimple) {
      if (draftLines.length !== 1) return "Un producto simple debe tener exactamente un insumo asociado.";
      const line = draftLines[0];
      if (!line.ingredientId) return "Debes seleccionar un insumo.";
      if (line.isOptional) return "El insumo de un producto simple debe ser obligatorio.";
      if (getLineQuantity(line) !== 1) return "La cantidad de insumo para un producto simple debe ser exactamente 1.";
    } else {
      if (draftLines.length < 1) return "La receta debe tener al menos un insumo.";
      const mandatory = draftLines.filter((l) => !l.isOptional);
      if (mandatory.length < 1) return "La receta compuesta debe tener al menos un insumo obligatorio.";

      for (const line of draftLines) {
        if (!line.ingredientId) return "Cada línea debe tener un insumo válido.";
        const qty = getLineQuantity(line);
        if (!Number.isFinite(qty) || qty <= 0) {
          return "La cantidad de cada insumo debe ser mayor a 0.";
        }
      }
    }

    const ids = draftLines.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) {
      return "No se permiten insumos duplicados en la receta.";
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
    const loadingId = toast.loading("Guardando receta...");
    try {
      const payload = {
        lines: draftLines.map((l) => ({
          ingredientId: l.ingredientId,
          quantityRequired: isSimple ? 1 : roundQuantity(getLineQuantity(l)),
          isOptional: isSimple ? false : !!l.isOptional,
        })),
      };

      await replaceRecipe(item.id, payload);
      toast.dismiss(loadingId);
      toast.success("Receta guardada correctamente");
      setIsExpanded(false);
      await onSaveSuccess();
    } catch (error) {
      console.error(error);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(error, "No se pudo guardar la receta"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setDraftLines(recipeLines.map((line) => normalizeLine(line)));
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
      {/* HEADER CARD */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left flex items-start gap-4 select-none"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-inner">
          <BookOpen className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-slate-800 leading-tight">
              {item.name}
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
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Venta</span>
          <span className="text-slate-700 block mt-0.5 truncate text-xs font-extrabold">
            ${formatMoney(price)}
          </span>
        </div>
        <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-50 text-center">
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Costo Est.</span>
          <span className="text-slate-700 block mt-0.5 truncate text-xs font-extrabold">
            {displayCost === null ? "—" : `$${formatMoney(displayCost)}`}
          </span>
        </div>
        <div className="bg-slate-50/50 rounded-xl p-2 border border-slate-50 text-center">
          <span className="block text-[8px] uppercase tracking-wider text-slate-400/85">Ganancia Est.</span>
          <span className={cn("block mt-0.5 truncate text-xs font-extrabold", displayMargin !== null && displayMargin >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {displayMargin === null ? "—" : `$${formatMoney(displayMargin)}`}
          </span>
        </div>
      </div>

      {/* SELLABILITY WARNING BOX */}
      {item.sellability && !item.sellability.sellable ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3 text-xs font-semibold text-amber-900 shadow-2xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>No visible en la tienda pública</span>
          </div>
          <div className="text-[11px] text-amber-800 leading-relaxed">
            {item.sellability.status === "MISSING_RECIPE" && (
              "Este producto no aparece en la tienda porque no tiene receta base configurada."
            )}
            {item.sellability.status === "MISSING_INITIAL_STOCK" && (
              "Este producto no aparece en la tienda porque no tiene inventario inicial configurado."
            )}
            {item.sellability.status === "INACTIVE" && (
              "Este producto no aparece en la tienda porque está marcado como inactivo."
            )}
            {item.sellability.status === "NO_STOCK" && (
              "Este producto no aparece en la tienda porque no tiene stock disponible."
            )}
            {item.sellability.status === "INSUFFICIENT_RECIPE_STOCK" && (
              "Este producto no aparece en la tienda porque falta stock en los siguientes insumos obligatorios:"
            )}
          </div>
          {item.sellability.status === "INSUFFICIENT_RECIPE_STOCK" && item.sellability.missingItems && (
            <ul className="pl-4 list-disc text-[11px] text-amber-850 space-y-1 mt-1">
              {item.sellability.missingItems.map((missing: any) => (
                <li key={missing.id}>
                  <strong>{missing.name}</strong>: Disponible: {formatMoney(Number(missing.available))} · Requerido: {formatMoney(Number(missing.required))} {missing.unit}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

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
              Configuración
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
            <ConsumptionHistoryTab itemId={item.id} type="recipe" />
          ) : (
            <>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Ingredientes
                  </p>
                  {!isSimple && (
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
                  )}
                </div>

                {/* ADD INGREDIENT SELECTOR INLINE */}
                {!isSimple && showAddSelector && (
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
                    
                    const quantityRequiredBase = isSimple ? 1 : line.quantityRequired;
                    const displayQuantity = isSimple ? 1 : getDisplayQuantity(line);
                    
                    const quantityPerUnit = displayQuantity;
                    const consumptionInfo = ing
                      ? formatRecipeConsumption({ ingredient: ing, quantityRequired: quantityRequiredBase })
                      : null;

                    return (
                      <div
                        key={`${line.ingredientId}-${idx}`}
                        className="rounded-2xl border border-slate-100 bg-white p-3 shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {isSimple ? (
                            <div className="flex-1">
                              <select
                                value={line.ingredientId}
                                onChange={(e) =>
                                  setDraftLines([
                                    {
                                      ingredientId: e.target.value,
                                      quantityRequired: 1,
                                      quantityInput: "1",
                                      baseQuantityRequired: 1,
                                      stepQuantity: 1,
                                      isOptional: false,
                                    },
                                  ])
                                }
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-bold text-slate-750 outline-none focus:border-slate-400"
                              >
                                <option value="">Seleccionar insumo...</option>
                                {allIngredients
                                  .filter((i) => i.status !== "INACTIVE")
                                  .map((activeIng) => (
                                    <option key={activeIng.id} value={activeIng.id}>
                                      {activeIng.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ) : (
                            <h4 className="truncate text-xs font-bold text-slate-800">
                              {getIngredientName(line.ingredientId)}
                            </h4>
                          )}

                          {!isSimple && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-slate-400">
                            {line.ingredientId ? `Costo prom.: $${formatMoney(costVal)} / ${unitLabel}` : "—"}
                          </p>
                          {!isSimple && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftLines((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, isOptional: !l.isOptional } : l))
                                )
                              }
                              className={cn(
                                "rounded px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider transition active:scale-95 border",
                                line.isOptional
                                  ? "bg-amber-50 text-amber-700 border-amber-100"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-100"
                              )}
                            >
                              {line.isOptional ? "Opcional" : "Obligatorio"}
                            </button>
                          )}
                        </div>

                        {isMeasuredIngredient(ing) && Number.isFinite(quantityPerUnit) && quantityPerUnit > 0 && (
                          <div className="rounded-xl bg-slate-50/50 p-2.5 text-[10px] font-semibold leading-relaxed text-slate-500 border border-slate-50">
                            {consumptionInfo?.lines.map((lineText) => (
                              <p key={lineText} className="text-slate-600">
                                • {lineText}
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 p-0.5 border border-slate-150">
                            {!isSimple && (
                              <button
                                type="button"
                                disabled={getLineQuantity(line) <= getMinimumQuantity(line)}
                                onClick={() => handleDecrement(idx, line)}
                                className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                              >
                                -
                              </button>
                            )}

                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              disabled={isSimple}
                              value={isSimple ? 1 : line.quantityInput}
                              onBlur={(e) => {
                                if (isSimple) return;
                                const val = toNumber(e.target.value, NaN);
                                const minVal = getMinimumQuantity(line);
                                updateQuantity(idx, !Number.isFinite(val) || val <= 0 ? minVal : val);
                              }}
                              onChange={(e) => {
                                if (isSimple) return;
                                updateQuantityInput(idx, e.target.value);
                              }}
                              className="w-12 bg-transparent text-center text-xs font-bold text-slate-750 outline-none disabled:opacity-100"
                            />

                            {!isSimple && (
                              <button
                                type="button"
                                onClick={() => handleIncrement(idx, line)}
                                className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                              >
                                +
                              </button>
                            )}
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
                    La receta no tiene ingredientes. Agrega uno para comenzar.
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
                    {submitting ? "Guardando..." : "Guardar receta"}
                  </button>
                </div>
              )}
              {item.type === "PRODUCT" && (
                <ProductCustomizationManager item={item} allIngredients={allIngredients} />
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
