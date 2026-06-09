"use client";

import { useMemo, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Plus, Trash2, BookOpen } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import { replaceRecipe, type RecipeLine, type InventorySummaryIngredient } from "@/src/services/inventory";
import { formatIngredientUnit } from "@/src/components/inventory/unitLabels";
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
  const [draftLines, setDraftLines] = useState<DraftRecipeLine[]>([]);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  // Helpers to get ingredient details
  const getIngredientDetails = (ingredientId: string) => {
    return allIngredients.find((i) => i.id === ingredientId) ?? null;
  };

  const getIngredientName = (ingredientId: string) => {
    return getIngredientDetails(ingredientId)?.name ?? "Desconocido";
  };

  const getIngredientUnit = (ingredientId: string) => {
    const ing = getIngredientDetails(ingredientId);
    return ing ? formatIngredientUnit(ing) : "";
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
        ? { label: "Stock simple", tone: "bg-emerald-50 text-emerald-800" }
        : { label: "Sin insumo", tone: "bg-rose-50 text-rose-700" };
    }

    if (!linesToCheck.length) return { label: "Sin receta", tone: "bg-rose-50 text-rose-700" };
    if (mandatory.length < 1 || hasInvalid) return { label: "Receta incompleta", tone: "bg-amber-50 text-amber-800" };
    return { label: "Receta configurada", tone: "bg-emerald-50 text-emerald-800" };
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
      prev.map((line, i) =>
        i === idx
          ? { ...line, quantityRequired: cleanVal, quantityInput: formatQuantity(cleanVal) }
          : line,
      )
    );
  };

  const updateQuantityInput = (idx: number, value: string) => {
    if (isSimple) return;
    setDraftLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const normalized = value.replace(",", ".");
        const numericValue = toNumber(normalized, NaN);
        return {
          ...line,
          quantityInput: value,
          quantityRequired:
            normalized.trim() !== "" && Number.isFinite(numericValue) && numericValue > 0
              ? roundQuantity(numericValue)
              : line.quantityRequired,
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
    const current = toNumber(line.quantityRequired, 0);
    const step = getStepQuantity(line);
    const minVal = getMinimumQuantity(line);
    const next = roundQuantity(current - step);
    updateQuantity(idx, next < minVal ? minVal : next);
  };

  const handleIncrement = (idx: number, line: DraftRecipeLine) => {
    if (isSimple) return;
    const current = toNumber(line.quantityRequired, 0);
    const step = getStepQuantity(line);
    const newVal = roundQuantity(current + step);
    updateQuantity(idx, newVal);
  };

  const handleRemoveLine = (idx: number) => {
    if (isSimple) return; // Cannot delete simple mode line
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddIngredient = (ingredientId: string) => {
    if (!ingredientId) return;

    if (isSimple && draftLines.length >= 1) {
      toast.error("Un producto simple no puede tener más de un insumo.");
      return;
    }

    // Check duplicate
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
        quantityInput: formatQuantity(initialQty),
        baseQuantityRequired: initialQty,
        stepQuantity: initialQty,
        isOptional: false,
      },
    ]);
    setShowAddSelector(false);
  };

  // Validations before save
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

    // Check duplicates
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

  // Cost and margin to display
  const displayCost = isExpanded ? draftCost : originalCost;
  const displayMargin = isExpanded ? draftMargin : originalMargin;
  const displayStatus = isExpanded ? currentStatus : status;

  return (
    <article
      className={cn(
        "rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5 transition duration-150",
        isExpanded ? "ring-black/10 bg-neutral-50/10" : "hover:bg-neutral-50/30"
      )}
    >
      {/* HEADER CARD - CLICKABLE TO TOGGLE */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex cursor-pointer items-start justify-between gap-3 select-none"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100/50">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  displayStatus.tone
                )}
              >
                {displayStatus.label}
              </span>
            </div>
            <p className="mt-1 text-xs font-normal text-slate-500 leading-tight">
              Venta: <span className="font-medium text-slate-700">${formatMoney(price)}</span> · Costo est:{" "}
              <span className="font-medium text-slate-700">
                {displayCost === null ? "Incompleto" : `$${formatMoney(displayCost)}`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {displayMargin !== null && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide shadow-sm",
                displayMargin >= 0
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100/35"
                  : "bg-rose-50 text-rose-800 ring-1 ring-rose-100/35"
              )}
            >
              {displayMargin >= 0 ? "+" : ""}${formatMoney(displayMargin)}
            </span>
          )}
          <div className="text-slate-400">
            {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
          </div>
        </div>
      </div>

      {/* EXPANDED CONTENT */}
      {isExpanded && (
        <div className="mt-4 border-t border-slate-100 pt-3.5 space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Insumos de la receta
              </p>
              {!isSimple && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAddSelector(!showAddSelector);
                  }}
                  aria-label="Agregar insumo a la receta"
                  className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* ADD INGREDIENT SELECTOR INLINE */}
            {!isSimple && showAddSelector && (
              <div
                className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/10 p-2.5 flex flex-col gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-800">
                    <Plus className="h-3 w-3" />
                    <span>Seleccionar insumo para agregar</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddSelector(false)}
                    className="text-[10px] font-medium text-slate-400 hover:text-slate-600"
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
                  >
                    <option value="">Seleccionar insumo...</option>
                    {availableIngredients.map((ing) => {
                      const avgCost = toNumber(ing.averageCost, 0);
                      const unit = formatIngredientUnit(ing);
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

            {draftLines.map((line, idx) => {
              const ing = getIngredientDetails(line.ingredientId);
              const costVal = toNumber(ing?.averageCost, 0);
              const unitLabel = getIngredientUnit(line.ingredientId);
              return (
                <div
                  key={`${line.ingredientId}-${idx}`}
                  className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-2xs space-y-1.5"
                  onClick={(e) => e.stopPropagation()} // Prevent card toggle on clicks
                >
                  {/* Fila 1: Nombre / Selector y Basura */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    {isSimple ? (
                      <div className="flex-1 min-w-0">
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
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/30 px-2.5 py-1 text-xs font-semibold text-slate-750 outline-none focus:border-emerald-500"
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
                      <p className="truncate text-xs font-semibold text-slate-800 min-w-0 flex-1">
                        {getIngredientName(line.ingredientId)}
                      </p>
                    )}

                    {!isSimple && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                        aria-label="Eliminar insumo de la receta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Fila 2: Costo y Obligatoriedad */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-normal text-slate-400">
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
                          "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition active:scale-95 border",
                          line.isOptional
                            ? "bg-amber-50 text-amber-800 border-amber-100/50"
                            : "bg-emerald-50 text-emerald-800 border-emerald-100/50"
                        )}
                      >
                        {line.isOptional ? "Opcional" : "Oblig."}
                      </button>
                    )}
                  </div>

                  {/* Fila 3: Controles de Cantidad y Unidad */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full bg-slate-50 p-0.5 ring-1 ring-slate-100/50">
                      {!isSimple ? (
                        <button
                          type="button"
                          disabled={getLineQuantity(line) <= getMinimumQuantity(line)}
                          onClick={() => handleDecrement(idx, line)}
                          className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white text-xs font-semibold text-slate-600 shadow-3xs transition hover:bg-slate-100 disabled:opacity-40"
                          aria-label="Disminuir cantidad"
                        >
                          -
                        </button>
                      ) : null}

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
                        className="w-12 bg-transparent text-center text-xs font-semibold text-slate-700 outline-none disabled:opacity-100"
                      />

                      {!isSimple ? (
                        <button
                          type="button"
                          onClick={() => handleIncrement(idx, line)}
                          className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white text-xs font-semibold text-slate-600 shadow-3xs transition hover:bg-slate-100"
                          aria-label="Aumentar cantidad"
                        >
                          +
                        </button>
                      ) : null}
                    </div>

                    <p className="text-[11px] font-medium text-slate-400 select-none">
                      {unitLabel}
                    </p>
                  </div>
                </div>
              );
            })}

            {draftLines.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
                La receta no tiene ingredientes. Agrega uno para comenzar.
              </div>
            )}
          </div>

          {/* SAVE/CANCEL FOOTER */}
          {isDirty && (
            <div
              className="flex items-center justify-end gap-2.5 pt-1.5 border-t border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-850 active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Guardando..." : "Guardar receta"}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
