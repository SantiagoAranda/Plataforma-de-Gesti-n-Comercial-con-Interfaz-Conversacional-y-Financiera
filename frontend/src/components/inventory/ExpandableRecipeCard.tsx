"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  BookOpen,
  ChefHat,
  ChevronDown,
  ChevronUp,
  EyeOff,
  History,
  Plus,
  Save,
  Settings,
  Trash2,
  Utensils,
} from "lucide-react";

import { ProductCustomizationManager } from "@/src/components/inventory/ProductCustomizationManager";
import {
  QuantityStepper,
  getStepAndPrecisionForUnit,
} from "@/src/components/inventory/QuantityStepper";
import { cn } from "@/src/lib/utils";
import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import {
  replaceRecipe,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import { ConsumptionHistoryTab } from "./ConsumptionHistoryTab";
import { ProfitSimulator } from "./ProfitSimulator";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { getErrorMessage } from "@/src/lib/errors";
import type { Item } from "@/src/types/item";

type Props = {
  item: Item;
  recipeLines: RecipeLine[];
  allIngredients: InventorySummaryIngredient[];
  onSaveSuccess: () => Promise<void>;
  initiallyExpanded?: boolean;
  onSaveContextChange?: (
    context: {
      message: string;
      saveLabel: string;
      isSaving: boolean;
      onSave: () => void | Promise<void>;
      onDiscard: () => void;
    } | null,
  ) => void;
};

type DraftRecipeLine = RecipeLine & {
  quantityRequired: number;
  quantityInput: string;
  baseQuantityRequired: number;
  stepQuantity: number;
};

type RecipeSubTab = "config" | "history";

function toNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = Number(String(val).replace(",", "."));
  return Number.isFinite(num) ? num : fallback;
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(6));
}

function formatQuantity(value: number | string | null | undefined): string {
  return formatQuantityCompact(value);
}

function formatQuantityInput(value: number): string {
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
  onSaveContextChange,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [activeSubTab, setActiveSubTab] = useState<RecipeSubTab>("config");
  const [draftLines, setDraftLines] = useState<DraftRecipeLine[]>([]);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [baseIngredientsOpen, setBaseIngredientsOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);

  const isSimple = item.inventoryMode === "SIMPLE";
  const isRecipeBased = item.inventoryMode === "RECIPE_BASED";

  const getIngredientDetails = (ingredientId: string) =>
    allIngredients.find((i) => i.id === ingredientId) ?? null;

  const getIngredientUnit = (ingredientId: string) => {
    const ing = getIngredientDetails(ingredientId);
    return ing ? getStockUnitSymbol(ing) : "";
  };

  const getIngredientName = (ingredientId: string) =>
    getIngredientDetails(ingredientId)?.name ?? "Selecciona un insumo";

  const normalizeLine = (
    line: RecipeLine,
    previous?: DraftRecipeLine,
  ): DraftRecipeLine => {
    const quantity = roundQuantity(toNumber(line.quantityRequired, 1));
    const step =
      previous?.stepQuantity && previous.stepQuantity > 0
        ? previous.stepQuantity
        : inferInitialStep(quantity);
    const base =
      previous?.baseQuantityRequired && previous.baseQuantityRequired > 0
        ? previous.baseQuantityRequired
        : step;

    return {
      ingredientId: line.ingredientId,
      quantityRequired: quantity,
      quantityInput: formatQuantityInput(quantity),
      baseQuantityRequired: base,
      stepQuantity: step,
      isOptional: !!line.isOptional,
    };
  };

  useEffect(() => {
    setDraftLines((current) =>
      recipeLines.map((line) =>
        normalizeLine(
          line,
          current.find(
            (draftLine) => draftLine.ingredientId === line.ingredientId,
          ),
        ),
      ),
    );
  }, [recipeLines, isExpanded]);

  const getLineQuantity = (line: RecipeLine | DraftRecipeLine) => {
    if ("quantityInput" in line && line.quantityInput.trim() !== "") {
      return toNumber(line.quantityInput, NaN);
    }
    return toNumber(line.quantityRequired, NaN);
  };

  const lineCost = (line: RecipeLine | DraftRecipeLine) => {
    const qty = getLineQuantity(line);
    const ing = getIngredientDetails(line.ingredientId);
    const avgCost = toNumber(ing?.averageCost, 0);
    return Number.isFinite(qty) && qty > 0 ? qty * avgCost : 0;
  };

  const calculateRecipeCost = (lines: Array<RecipeLine | DraftRecipeLine>) => {
    if (!lines.length) return null;

    let hasInvalid = false;
    const cost = lines.reduce((acc, line) => {
      const qty = getLineQuantity(line);
      const ing = getIngredientDetails(line.ingredientId);

      if (!line.ingredientId || !Number.isFinite(qty) || qty <= 0 || !ing) {
        hasInvalid = true;
      }

      return acc + lineCost(line);
    }, 0);

    return hasInvalid ? null : cost;
  };

  const price = toNumber(item.price, 0);
  const simpleCost = toNumber(item.averageCost, 0);
  const originalCost = useMemo(
    () => (isSimple ? simpleCost : calculateRecipeCost(recipeLines)),
    [recipeLines, allIngredients, isSimple, simpleCost],
  );
  const draftCost = useMemo(
    () => (isSimple ? simpleCost : calculateRecipeCost(draftLines)),
    [draftLines, allIngredients, isSimple, simpleCost],
  );
  const displayCost = isExpanded ? draftCost : originalCost;
  const displayProfit = displayCost === null ? null : price - displayCost;

  const getRecipeStatus = (
    linesToCheck: Array<RecipeLine | DraftRecipeLine>,
  ) => {
    if (isSimple) {
      return {
        label: "Inventario directo",
        tone: "bg-sky-50 text-sky-700 border border-sky-100",
        dotColor: "bg-sky-500",
      };
    }

    const mandatory = linesToCheck.filter((line) => !line.isOptional);
    const hasInvalid = linesToCheck.some((line) => {
      const qty = getLineQuantity(line);
      return !line.ingredientId || !Number.isFinite(qty) || qty <= 0;
    });

    if (!linesToCheck.length) {
      return {
        label: "Pendiente",
        tone: "bg-amber-100 text-[#ff4800] border border-amber-200",
        dotColor: "bg-[#ff4800]",
      };
    }

    if (mandatory.length < 1 || hasInvalid) {
      return {
        label: "Incompleta",
        tone: "bg-amber-50 text-amber-800 border border-amber-200",
        dotColor: "bg-amber-500",
      };
    }

    return {
      label: "Configurada",
      tone: "bg-emerald-100 text-[#0c6312] border border-emerald-200",
      dotColor: "bg-[#00963d]",
    };
  };

  const status = getRecipeStatus(recipeLines);
  const currentStatus = getRecipeStatus(draftLines);
  const displayStatus = isExpanded ? currentStatus : status;
  const recipeImageUrl = [...(item.images ?? [])].sort(
    (left, right) => left.order - right.order,
  )[0]?.url;
  const recipeAvatar = (item.name ?? "R").trim().slice(0, 1).toUpperCase();

  const isDirty = useMemo(() => {
    if (isSimple) return false;
    if (draftLines.length !== recipeLines.length) return true;

    for (let i = 0; i < recipeLines.length; i++) {
      const original = recipeLines[i];
      const draft = draftLines[i];
      if (!draft) return true;
      if (original.ingredientId !== draft.ingredientId) return true;
      if (toNumber(original.quantityRequired) !== draft.quantityRequired)
        return true;
      if (!!original.isOptional !== !!draft.isOptional) return true;
    }

    return false;
  }, [isSimple, recipeLines, draftLines]);

  const availableIngredients = useMemo(() => {
    const usedIds = new Set(
      draftLines.map((line) => line.ingredientId).filter(Boolean),
    );
    return allIngredients.filter(
      (ing) => ing.status !== "INACTIVE" && !usedIds.has(ing.id),
    );
  }, [allIngredients, draftLines]);

  const updateQuantity = (idx: number, val: number) => {
    if (isSimple) return;
    const cleanVal = roundQuantity(val);
    if (cleanVal <= 0) return;

    setDraftLines((prev) =>
      prev.map((line, i) =>
        i === idx
          ? {
              ...line,
              quantityRequired: cleanVal,
              quantityInput: formatQuantityInput(cleanVal),
            }
          : line,
      ),
    );
  };

  const handleRemoveLine = (idx: number) => {
    if (isSimple) return;
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddIngredient = (ingredientId: string) => {
    if (!ingredientId || isSimple) return;

    if (draftLines.some((line) => line.ingredientId === ingredientId)) {
      toast.error("El insumo ya está en la receta");
      return;
    }

    const ing = getIngredientDetails(ingredientId);
    if (!ing) return;

    setDraftLines((prev) => [
      ...prev,
      {
        ingredientId,
        quantityRequired: 1,
        quantityInput: "1",
        baseQuantityRequired: 1,
        stepQuantity: 1,
        isOptional: false,
      },
    ]);
    setShowAddSelector(false);
  };

  const validate = () => {
    if (isSimple) return null;

    if (draftLines.length < 1)
      return "La receta debe tener al menos un insumo.";
    const mandatory = draftLines.filter((line) => !line.isOptional);
    if (mandatory.length < 1)
      return "La receta debe tener al menos un insumo obligatorio.";

    for (const line of draftLines) {
      if (!line.ingredientId) return "Cada línea debe tener un insumo válido.";
      const qty = getLineQuantity(line);
      if (!Number.isFinite(qty) || qty <= 0) {
        return "La cantidad de cada insumo debe ser mayor a 0.";
      }
    }

    const ids = draftLines.map((line) => line.ingredientId);
    if (new Set(ids).size !== ids.length) {
      return "No se permiten insumos duplicados en la receta.";
    }

    return null;
  };

  const handleSave = async () => {
    if (submitInFlightRef.current || isSimple) return;

    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    const loadingId = toast.loading("Guardando receta...");

    try {
      const payload = {
        lines: draftLines.map((line) => ({
          ingredientId: line.ingredientId,
          quantityRequired: roundQuantity(getLineQuantity(line)),
          isOptional: !!line.isOptional,
        })),
      };

      await replaceRecipe(item.id, payload);
      toast.dismiss(loadingId);
      toast.success("Receta guardada correctamente");
      await onSaveSuccess();
    } catch (error) {
      console.error(error);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(error, "No se pudo guardar la receta"));
    } finally {
      setSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  const handleCancel = () => {
    setDraftLines(recipeLines.map((line) => normalizeLine(line)));
    setShowAddSelector(false);
  };

  const requestDiscardRecipe = () => {
    handleCancel();
  };

  useEffect(() => {
    if (!isExpanded || !isRecipeBased || !isDirty) {
      onSaveContextChange?.(null);
      return;
    }
    onSaveContextChange?.({
      message: `Cambios en “${item.name}”`,
      saveLabel: "Guardar receta",
      isSaving: submitting,
      onSave: handleSave,
      onDiscard: requestDiscardRecipe,
    });
  }, [
    isExpanded,
    isRecipeBased,
    isDirty,
    submitting,
    draftLines,
    item.id,
    item.name,
  ]);

  const renderSellabilityMessage = () => {
    if (!item.sellability || item.sellability.sellable) return null;

    if (item.sellability.status === "MISSING_RECIPE") {
      return "Este producto necesita al menos un ingrediente obligatorio antes de poder venderse.";
    }
    if (item.sellability.status === "MISSING_INITIAL_STOCK") {
      return "Este producto no aparece en la tienda porque no tiene inventario inicial configurado.";
    }
    if (item.sellability.status === "INACTIVE") {
      return "Este producto no aparece en la tienda porque está marcado como inactivo.";
    }
    if (item.sellability.status === "NO_STOCK") {
      return "Este producto no aparece en la tienda porque no tiene stock disponible.";
    }
    if (item.sellability.status === "INSUFFICIENT_RECIPE_STOCK") {
      return "Este producto no aparece en la tienda porque falta stock en insumos obligatorios.";
    }

    return (
      item.sellability.message ??
      "Este producto no está disponible para la tienda pública."
    );
  };

  const sellabilityMessage = renderSellabilityMessage();

  // If simple product, preserve exact original rendering
  if (isSimple) {
    return (
      <article
        className={cn(
          "overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition hover:shadow-md",
          isExpanded && "ring-1 ring-slate-200",
        )}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex w-full items-start gap-3 p-4 text-left"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#E0E7FF] text-[#0B3F64]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold leading-tight text-slate-950">
                  {item.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      displayStatus.tone,
                    )}
                  >
                    {displayStatus.label}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                  Venta
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-950">
                  ${formatMoney(price)}
                </p>
              </div>
            </div>
          </div>

          <span className="mt-1 shrink-0 text-slate-400">
            {isExpanded ? (
              <ChevronUp className="h-4.5 w-4.5" />
            ) : (
              <ChevronDown className="h-4.5 w-4.5" />
            )}
          </span>
        </button>

        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-4 py-2.5">
          <MetricCard
            label="Venta"
            value={`$${formatMoney(price)}`}
            tone="neutral"
          />
          <MetricCard
            label="Costo base"
            value={
              displayCost === null
                ? "Sin datos"
                : `$${formatMoney(displayCost)}`
            }
            tone="emerald"
          />
          <MetricCard
            label="Ganancia base"
            value={
              displayProfit === null
                ? "Sin datos"
                : `${displayProfit < 0 ? "-" : ""}$${formatMoney(Math.abs(displayProfit))}`
            }
            tone={displayProfit !== null && displayProfit < 0 ? "rose" : "blue"}
          />
        </div>

        {isExpanded && (
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <h4 className="text-sm font-medium text-slate-950">
                Stock directo
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Este producto descuenta su propio stock al confirmar una venta.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <InfoCell
                  label="Stock actual"
                  value={formatQuantity(item.currentStock)}
                />
                <InfoCell
                  label="Costo promedio"
                  value={`$${formatMoney(toNumber(item.averageCost, 0))}`}
                />
                <InfoCell
                  label="Stock mínimo"
                  value={formatQuantity(item.minStock)}
                />
                <InfoCell label="Unidad" value="unidades" />
              </div>
            </div>
            {item.type === "PRODUCT" && (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div>
                  <h4 className="text-sm font-medium text-slate-950">
                    Grupos de personalización
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Configurá opciones como proteínas, tamaños o toppings.
                  </p>
                </div>
                <ProductCustomizationManager
                  item={item}
                  allIngredients={allIngredients}
                  hideHeader
                  onSaveContextChange={onSaveContextChange}
                />
              </section>
            )}
          </div>
        )}
      </article>
    );
  }

  // REDESIGNED LAYOUT FOR RECIPE_BASED PRODUCTS
  return (
    <article className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden border-t-4 border-t-[#0b3f64] transition hover:shadow-sm">
      {/* Header del Producto */}
      <header className="p-4 bg-gradient-to-b from-slate-50/80 to-white space-y-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600 shadow-inner">
            {recipeImageUrl ? (
              <img
                src={recipeImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              recipeAvatar
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-slate-800">
              {item.name}
            </h3>

            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-medium text-black sm:text-[10px]",
                displayStatus.tone,
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  displayStatus.dotColor,
                )}
              />
              {displayStatus.label}
            </span>

            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              className="shrink-0 rounded-lg p-1.5 text-black transition-colors hover:bg-slate-100 hover:opacity-70"
              title={isExpanded ? "Colapsar" : "Expandir"}
            >
              <ChevronUp
                className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  !isExpanded && "rotate-180",
                )}
              />
            </button>
          </div>
        </div>
      </header>

      <section className="border-t border-slate-100 px-4 py-3">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="min-w-0 overflow-hidden rounded-xl border border-[#0b3f64]/30 bg-[rgba(11,63,100,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
            <span className="block truncate text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black">
              Venta
            </span>
            <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
              ${formatMoney(price)}
            </span>
          </div>
          <div className="min-w-0 overflow-hidden rounded-xl border border-[#ff0041]/30 bg-[rgba(255,0,65,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
            <span className="block text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black leading-tight">
              Costo base
            </span>
            <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
              {displayCost === null ? "—" : `$${formatMoney(displayCost)}`}
            </span>
          </div>
          <div className="min-w-0 overflow-hidden rounded-xl border border-[#00963d]/30 bg-[rgba(0,150,61,0.08)] px-1.5 py-2 text-center sm:px-2.5 sm:py-2.5">
            <span className="block text-[8px] sm:text-[9px] font-medium uppercase tracking-wider text-black leading-tight">
              Ganancia base
            </span>
            <span className="mt-0.5 block truncate text-sm sm:text-base font-medium text-black tabular-nums tracking-tight whitespace-nowrap">
              {displayProfit === null ? "—" : `$${formatMoney(displayProfit)}`}
            </span>
          </div>
        </div>
      </section>

      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-slate-100">
          <ProfitSimulator cost={displayCost} />
          <nav className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("config")}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all sm:px-3 sm:py-1.5 sm:text-xs",
                activeSubTab === "config"
                  ? "bg-[#0b3f64] text-white shadow-xs"
                  : "border border-slate-200 bg-white text-black hover:bg-slate-50",
              )}
            >
              <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Configuración
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("history")}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all sm:px-3 sm:py-1.5 sm:text-xs",
                activeSubTab === "history"
                  ? "bg-[#0b3f64] text-white shadow-xs"
                  : "border border-slate-200 bg-white text-black hover:bg-slate-50",
              )}
            >
              <History className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Historial de consumo
            </button>
          </nav>
          {activeSubTab === "history" ? (
            <ConsumptionHistoryTab
              itemId={item.id}
              itemName={item.name}
              type="recipe"
            />
          ) : (
            <>
              {/* Estado Vacío: Receta pendiente */}
              {draftLines.length === 0 && (
                <section className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 text-[#ff4800]">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium text-black">
                      Receta pendiente
                    </h4>
                    <p className="text-xs font-normal text-black/70 mt-0.5 max-w-sm mx-auto">
                      Este producto utiliza ingredientes, pero todavía no tiene
                      una receta configurada.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 bg-amber-100/80 text-black text-[11px] font-normal px-2.5 py-1 rounded-md">
                    <EyeOff className="w-3.5 h-3.5 text-[#ff4800] shrink-0" />
                    <span>
                      No visible en la tienda pública sin receta base.
                    </span>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddSelector(true)}
                      className="bg-[#0b3f64] hover:bg-[#121a28] text-white font-normal text-xs px-4 py-2 rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4 text-white" />
                      <span>Agregar primer ingrediente</span>
                    </button>
                  </div>
                </section>
              )}

              {/* Ingredientes base (Receta configurada) */}
              {(draftLines.length > 0 || showAddSelector) && (
                <section className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-[#0b3f64]" />
                      <h4 className="text-xs font-medium text-black uppercase tracking-wide">
                        Ingredientes base
                      </h4>
                    </div>
                    <span className="text-[11px] text-black/60 font-normal">
                      Receta predeterminada
                    </span>
                  </div>

                  <div className="bg-slate-50/60 border border-slate-200 border-l-4 border-l-[#0b3f64] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setBaseIngredientsOpen((prev) => !prev)}
                      className="w-full p-3 flex items-center justify-between hover:bg-slate-100/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs sm:text-sm text-black">
                          Ingredientes de la receta base
                        </span>
                        <span className="bg-[rgba(11,63,100,0.08)] text-black text-[10px] font-normal px-2 py-0.5 rounded-full border border-blue-100">
                          {draftLines.length}{" "}
                          {draftLines.length === 1
                            ? "ingrediente"
                            : "ingredientes"}
                        </span>
                      </div>
                      <ChevronUp
                        className={cn(
                          "w-4 h-4 text-black transition-transform duration-200",
                          !baseIngredientsOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {baseIngredientsOpen && (
                      <div className="p-3 border-t border-slate-200 space-y-3 bg-white">
                        <div className="space-y-2">
                          {draftLines.map((line, idx) => {
                            const ingredient = getIngredientDetails(
                              line.ingredientId,
                            );
                            const unit = getIngredientUnit(line.ingredientId);
                            const quantity = getLineQuantity(line);
                            const averageCost = toNumber(
                              ingredient?.averageCost,
                              0,
                            );
                            const stock = toNumber(ingredient?.currentStock, 0);
                            const uses =
                              Number.isFinite(quantity) && quantity > 0
                                ? Math.floor(stock / quantity)
                                : 0;
                            const totalCost = lineCost(line);
                            const { step, precision } =
                              getStepAndPrecisionForUnit(unit);

                            return (
                              <div
                                key={`${line.ingredientId}-${idx}`}
                                className="bg-slate-50/50 border border-slate-200 rounded-xl p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-xs sm:text-sm text-black">
                                        {getIngredientName(line.ingredientId)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDraftLines((prev) =>
                                            prev.map((l, i) =>
                                              i === idx
                                                ? {
                                                    ...l,
                                                    isOptional: !l.isOptional,
                                                  }
                                                : l,
                                            ),
                                          )
                                        }
                                        className={cn(
                                          "text-[10px] font-normal px-1.5 py-0.5 rounded border transition text-black",
                                          line.isOptional
                                            ? "bg-amber-50 border-amber-200"
                                            : "bg-blue-50 border-blue-100",
                                        )}
                                      >
                                        {line.isOptional
                                          ? "Opcional"
                                          : "Obligatorio"}
                                      </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className="text-xs text-black font-normal">
                                        Consumo:
                                      </span>
                                      <QuantityStepper
                                        value={quantity}
                                        onChange={(val) =>
                                          updateQuantity(idx, val)
                                        }
                                        step={step}
                                        precision={precision}
                                        unitLabel={unit}
                                        ariaLabel={getIngredientName(
                                          line.ingredientId,
                                        )}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveLine(idx)}
                                      className="p-1.5 text-black hover:text-[#ff0041] rounded-lg hover:bg-rose-50 transition-colors"
                                      title="Eliminar ingrediente"
                                    >
                                      <Trash2 className="w-4 h-4 text-[#ff0041]" />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 mt-2 border-t border-slate-200/60 text-[11px] text-black font-normal">
                                  <div>
                                    <span className="text-black/60 block text-[10px]">
                                      Costo unidad
                                    </span>
                                    ${formatMoney(averageCost)}{" "}
                                    {unit ? `/ ${unit}` : ""}
                                  </div>
                                  <div>
                                    <span className="text-black/60 block text-[10px]">
                                      Costo total
                                    </span>
                                    <span className="text-black font-normal">
                                      ${formatMoney(totalCost)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-black/60 block text-[10px]">
                                      Stock actual
                                    </span>
                                    {formatQuantity(stock)} {unit}
                                  </div>
                                  <div>
                                    <span className="text-black/60 block text-[10px]">
                                      Producciones
                                    </span>
                                    <span className="font-normal text-black">
                                      {formatQuantity(uses)} disp.
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {showAddSelector ? (
                          <div className="rounded-xl border-2 border-[#0b3f64] bg-white p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                              <span className="text-[10px] font-normal uppercase tracking-wide text-black">
                                AÑADIR INGREDIENTE
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowAddSelector(false)}
                                className="text-[10px] font-normal text-black hover:opacity-80 transition-opacity"
                              >
                                Cancelar
                              </button>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[9px] uppercase font-normal text-black">
                                INSUMO / INGREDIENTE
                              </label>
                              <select
                                value=""
                                onChange={(e) =>
                                  handleAddIngredient(e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 border border-[#0b3f64] rounded-lg text-xs font-normal text-black bg-white focus:outline-none cursor-pointer"
                              >
                                <option value="">Seleccionar insumo...</option>
                                {availableIngredients.map((ing) => (
                                  <option key={ing.id} value={ing.id}>
                                    {ing.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAddSelector(true)}
                            className="w-full py-2.5 border border-dashed border-[#0b3f64] bg-[rgba(11,63,100,0.05)] hover:bg-blue-50 text-[#0b3f64] font-normal text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#0b3f64]" />
                            <span>AÑADIR INGREDIENTE</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Grupos de Personalización */}
              {item.type === "PRODUCT" && (
                <section className="space-y-3 pt-2 border-t border-slate-100">
                  <ProductCustomizationManager
                    item={item}
                    allIngredients={allIngredients}
                    hideHeader={false}
                    onSaveContextChange={onSaveContextChange}
                  />
                </section>
              )}

              {/* Sticky Action Bar */}
              {isRecipeBased && isDirty && !onSaveContextChange && (
                <div className="sticky bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xs border-t border-slate-200 p-3 z-30 flex items-center justify-end gap-3 rounded-b-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-normal text-black hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSave}
                    className="px-5 py-2 rounded-xl bg-[#0b3f64] text-white text-xs font-medium hover:bg-[#121a28] transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>
                      {submitting ? "Guardando..." : "Guardar receta"}
                    </span>
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

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "emerald" | "blue" | "rose";
}) {
  const toneClass = {
    neutral: "border-slate-100 bg-slate-50 text-slate-900",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-900",
    blue: "border-blue-100 bg-blue-50/70 text-blue-900",
    rose: "border-rose-100 bg-rose-50/70 text-rose-900",
  }[tone];

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border px-2.5 py-2 text-center",
        toneClass,
      )}
    >
      <p className="truncate text-[9px] font-medium uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
