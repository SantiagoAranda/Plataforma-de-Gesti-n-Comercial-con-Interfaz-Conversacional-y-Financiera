"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Edit2, Power, Trash2, X, Plus, Tag } from "lucide-react";

import { cn } from "@/src/lib/utils";
import {
  createPurchasePresentation,
  deactivateIngredient,
  deactivatePurchasePresentation,
  getIngredient,
  listKardex,
  listUnits,
  updateIngredient,
  updatePurchasePresentation,
  type Ingredient,
  type IngredientPurchasePresentation,
  type InventoryMovement,
  type Unit,
} from "@/src/services/inventory";
import { formatStockHeader } from "@/src/components/inventory/inventoryUnits";
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

const emptyPresentationForm = {
  name: "",
  purchaseUnitId: "",
  innerQuantity: "",
  innerUnitLabel: "",
  contentQuantity: "",
  contentUnitId: "",
  isDefault: false,
};

export function IngredientDetailSheet({ ingredientId, open, onClose, onChanged }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const movementFormRef = useRef<HTMLFormElement>(null);
  const ingredientFormRef = useRef<HTMLFormElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>("compras");
  const [loading, setLoading] = useState(false);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [kardexLoaded, setKardexLoaded] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movementFormValid, setMovementFormValid] = useState(false);
  const [movementFormSubmitting, setMovementFormSubmitting] = useState(false);
  const [ingredientFormValid, setIngredientFormValid] = useState(false);
  const [presentationSubmitting, setPresentationSubmitting] = useState(false);
  const [editingPresentationId, setEditingPresentationId] = useState<string | null>(null);
  const [presentationForm, setPresentationForm] = useState(emptyPresentationForm);

  const getIngredientStockUnit = useCallback(() => {
    if (!ingredient) return null;
    if (ingredient.stockUnit) return ingredient.stockUnit;
    if (ingredient.stockUnitId) {
      const found = units.find((u) => u.id === ingredient.stockUnitId);
      if (found) return found;
    }
    return units.find((u) => u.code === ingredient.consumptionUnit) ?? null;
  }, [ingredient, units]);

  const resetPresentationForm = useCallback(() => {
    setEditingPresentationId(null);
    const stockUnit = getIngredientStockUnit();
    if (stockUnit?.code === "UNIT") {
      const unit = units.find((u) => u.code === "UNIT");
      setPresentationForm({
        ...emptyPresentationForm,
        contentUnitId: unit?.id ?? "",
        contentQuantity: "1",
      });
    } else {
      setPresentationForm(emptyPresentationForm);
    }
  }, [units, getIngredientStockUnit]);

  const loadIngredientData = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const [ingData, unitsData] = await Promise.all([
        getIngredient(id),
        listUnits().catch(() => []),
      ]);
      setIngredient(ingData);
      setUnits(unitsData);
      setMovements([]);
      setKardexLoaded(false);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el detalle del ingrediente");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKardexData = useCallback(async (id: string) => {
    try {
      const kardexData = await listKardex(id);
      setMovements(kardexData);
      setKardexLoaded(true);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el Kardex");
    }
  }, []);

  useEffect(() => {
    if (!open || !ingredientId) return;

    setActiveTab("compras");
    setEditingPresentationId(null);
    setPresentationForm(emptyPresentationForm);
    void loadIngredientData(ingredientId);
  }, [open, ingredientId, loadIngredientData]);

  useEffect(() => {
    if (open) return;

    setIngredient(null);
    setMovements([]);
    setKardexLoaded(false);
    setUnits([]);
    setEditingPresentationId(null);
    setPresentationForm(emptyPresentationForm);
  }, [open]);

  useEffect(() => {
    if (ingredient && units.length > 0 && !editingPresentationId) {
      const stockUnit = getIngredientStockUnit();
      if (stockUnit?.code === "UNIT") {
        const unit = units.find((u) => u.code === "UNIT");
        setPresentationForm((prev) => {
          if (!prev.contentUnitId && !prev.contentQuantity) {
            return {
              ...prev,
              contentUnitId: unit?.id ?? "",
              contentQuantity: "1",
            };
          }
          return prev;
        });
      }
    }
  }, [ingredient, units, editingPresentationId, getIngredientStockUnit]);

  if (!open || !ingredientId) return null;

  const stockHeader = ingredient ? formatStockHeader(ingredient) : null;
  const stockUnitLabel = stockHeader?.unit ?? "";
  const commercialUnits = units.filter((unit) => unit.kind === "COMMERCIAL");
  const contentUnits = units.filter((unit) => unit.kind !== "COMMERCIAL");

  const filteredContentUnits = (() => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return contentUnits;
    if (stockUnit.code === "UNIT") {
      return contentUnits.filter((u) => u.code === "UNIT");
    }
    if (stockUnit.code === "G" || stockUnit.code === "KG") {
      return contentUnits.filter((u) => u.code === "G" || u.code === "KG");
    }
    if (stockUnit.code === "ML" || stockUnit.code === "L") {
      return contentUnits.filter((u) => u.code === "ML" || u.code === "L");
    }
    return contentUnits.filter((u) => u.kind === stockUnit.kind);
  })();

  const getPresentationValidationError = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    const contentUnit = units.find((u) => u.id === presentationForm.contentUnitId);
    if (!contentUnit) return null;

    if (stockUnit.code === "UNIT" && contentUnit.code !== "UNIT") {
      return "La unidad del contenido debe coincidir con la unidad base del stock. Este insumo se controla en unidades, por eso el contenido debe cargarse como unidades.";
    }

    if ((stockUnit.code === "G" || stockUnit.code === "KG") && (contentUnit.code !== "G" && contentUnit.code !== "KG")) {
      return "La unidad del contenido debe coincidir con la unidad base del stock. Este insumo se controla en peso, por eso el contenido debe cargarse como gramos o kilogramos.";
    }

    if ((stockUnit.code === "ML" || stockUnit.code === "L") && (contentUnit.code !== "ML" && contentUnit.code !== "L")) {
      return "La unidad del contenido debe coincidir con la unidad base del stock. Este insumo se controla en volumen, por eso el contenido debe cargarse como mililitros o litros.";
    }

    return null;
  };

  const renderHelpText = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    if (stockUnit.code === "UNIT") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por unidades. Para un pack de 6 latas, cargá: 6 latas × 1 unidad.
        </p>
      );
    }
    if (stockUnit.code === "ML" || stockUnit.code === "L") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por volumen. Para un pack de 6 latas de 354 ml, cargá: 6 latas × 354 ml.
        </p>
      );
    }
    if (stockUnit.code === "G" || stockUnit.code === "KG") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por peso. Para una caja de 4 medallones de 250 g, cargá: 4 medallón × 250 g.
        </p>
      );
    }
    return null;
  };

  const renderContentQuantityHelperText = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    const innerUnit = presentationForm.innerUnitLabel.trim() || "elemento";

    if (stockUnit.code === "UNIT") {
      return (
        <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
          Cada {innerUnit} suma 1 unidad al stock
        </span>
      );
    }
    if (stockUnit.code === "G" || stockUnit.code === "KG") {
      const formattedQty = presentationForm.contentQuantity ? `${presentationForm.contentQuantity} g` : "250 g";
      return (
        <span className="text-[10px] text-slate-500 font-medium mt-1 block">
          Ejemplo: Cada {innerUnit} contiene {formattedQty}
        </span>
      );
    }
    if (stockUnit.code === "ML" || stockUnit.code === "L") {
      const formattedQty = presentationForm.contentQuantity ? `${presentationForm.contentQuantity} ml` : "500 ml";
      return (
        <span className="text-[10px] text-slate-500 font-medium mt-1 block">
          Ejemplo: Cada {innerUnit} contiene {formattedQty}
        </span>
      );
    }
    return null;
  };

  const getDynamicFormulaPreview = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    const purchaseUnitName = commercialUnits.find((u) => u.id === presentationForm.purchaseUnitId)?.name?.toLowerCase() || "empaque";
    const innerQuantity = Number(presentationForm.innerQuantity.replace(",", "."));
    const innerUnitLabel = presentationForm.innerUnitLabel.trim() || "elementos";
    const contentQuantity = Number(presentationForm.contentQuantity.replace(",", "."));
    const contentUnit = units.find((u) => u.id === presentationForm.contentUnitId);
    if (!contentUnit) return null;

    if (!presentationForm.purchaseUnitId || isNaN(innerQuantity) || innerQuantity <= 0 || isNaN(contentQuantity) || contentQuantity <= 0) {
      return null;
    }

    let totalStockQty = innerQuantity * contentQuantity;
    let factor = 1;
    if (contentUnit.code === "KG" && stockUnit.code === "G") factor = 1000;
    else if (contentUnit.code === "G" && stockUnit.code === "KG") factor = 0.001;
    else if (contentUnit.code === "L" && stockUnit.code === "ML") factor = 1000;
    else if (contentUnit.code === "ML" && stockUnit.code === "L") factor = 0.001;
    
    totalStockQty = totalStockQty * factor;
    const formattedTotal = Number(totalStockQty.toFixed(6));
    const stockUnitSymbol = stockUnit.symbol ?? stockUnit.code.toLowerCase();

    return `1 ${purchaseUnitName} = ${innerQuantity} ${innerUnitLabel} × ${contentQuantity} ${contentUnit.symbol} = ${formattedTotal} ${stockUnitSymbol}`;
  };

  const presentationValidationError = getPresentationValidationError();
  const activePresentations = ingredient?.purchasePresentations?.filter((presentation) => presentation.isActive) ?? [];
  const canSavePresentation =
    Boolean(presentationForm.name.trim()) &&
    Boolean(presentationForm.purchaseUnitId) &&
    Boolean(presentationForm.contentUnitId) &&
    Number(presentationForm.innerQuantity.replace(",", ".")) > 0 &&
    Number(presentationForm.contentQuantity.replace(",", ".")) > 0 &&
    !presentationValidationError;

  const tabs: { id: TabType; label: string }[] = [
    { id: "compras", label: "Compras" },
    { id: "kardex", label: "Kardex" },
    { id: "insumo", label: "Insumo" },
  ];

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0 }));
    if (tab === "kardex" && ingredientId && !kardexLoaded) {
      void loadKardexData(ingredientId);
    }
  };

  const handleDeactivate = async () => {
    if (!ingredient) return;
    if (!window.confirm(`¿Desactivar el ingrediente "${ingredient.name}"?`)) return;

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
      const payload: any = {
        name: values.name,
        consumptionUnit: values.consumptionUnit,
        purchaseUnit: values.purchaseUnit,
        minStock: values.minStock,
        status: values.status,
      };
      const updated = await updateIngredient(ingredient.id, payload);
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
    if (!ingredientId) return;
    await loadIngredientData(ingredientId);
    if (activeTab === "kardex") await loadKardexData(ingredientId);
    onChanged();
  };

  const startEditPresentation = (presentation: IngredientPurchasePresentation) => {
    setEditingPresentationId(presentation.id);
    setPresentationForm({
      name: presentation.name,
      purchaseUnitId: presentation.purchaseUnitId,
      innerQuantity: String(presentation.innerQuantity ?? ""),
      innerUnitLabel: presentation.innerUnitLabel ?? "",
      contentQuantity: String(presentation.contentQuantity ?? ""),
      contentUnitId: presentation.contentUnitId,
      isDefault: presentation.isDefault,
    });
  };

  const handleSavePresentation = async () => {
    if (!ingredient) return;
    setPresentationSubmitting(true);
    const toastId = toast.loading(editingPresentationId ? "Actualizando presentación..." : "Creando presentación...");
    try {
      const payload = {
        name: presentationForm.name.trim(),
        purchaseUnitId: presentationForm.purchaseUnitId,
        innerQuantity: presentationForm.innerQuantity,
        innerUnitLabel: presentationForm.innerUnitLabel.trim() || undefined,
        contentQuantity: presentationForm.contentQuantity,
        contentUnitId: presentationForm.contentUnitId,
        isDefault: presentationForm.isDefault,
        isActive: true,
      };
      if (editingPresentationId) {
        await updatePurchasePresentation(ingredient.id, editingPresentationId, payload);
      } else {
        await createPurchasePresentation(ingredient.id, payload);
      }
      toast.success("Presentación guardada", { id: toastId });
      resetPresentationForm();
      await loadIngredientData(ingredient.id);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar la presentación", { id: toastId });
    } finally {
      setPresentationSubmitting(false);
    }
  };

  const handleDeactivatePresentation = async (presentationId: string) => {
    if (!ingredient) return;
    if (!window.confirm("¿Estás seguro de desactivar esta presentación?")) return;
    const toastId = toast.loading("Desactivando presentación...");
    try {
      await deactivatePurchasePresentation(ingredient.id, presentationId);
      toast.success("Presentación desactivada", { id: toastId });
      await loadIngredientData(ingredient.id);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error("No se pudo desactivar la presentación", { id: toastId });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex h-[88dvh] max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-slate-50 shadow-2xl transition-transform animate-in slide-in-from-bottom sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:h-[720px] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]">
        
        {/* Header container */}
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 pb-4 pt-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-slate-800">
                {loading ? "Cargando..." : ingredient?.name || "Detalle de Insumo"}
              </h2>
              {ingredient && !loading && stockHeader ? (
                <div className="mt-1 text-xs font-semibold text-slate-400 space-y-0.5 leading-tight">
                  <p>
                    Stock: <span className="font-bold text-slate-700">{stockHeader.stockText}</span> · Prom:{" "}
                    <span className="font-bold text-slate-700">{stockHeader.averageCostText}</span> · Mín:{" "}
                    <span className="font-bold text-slate-700">{stockHeader.minStockText}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ficha de producto
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {ingredient?.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
                  aria-label="Desactivar ingrediente"
                  title="Desactivar ingrediente"
                >
                  <Power className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Pill Tabs Selector */}
          <div className="flex gap-1.5 rounded-full bg-slate-100 p-1 ring-1 ring-black/5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex-1 rounded-full py-2 text-xs font-bold transition-all active:scale-[0.98]",
                  activeTab === tab.id
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 px-5 py-5 overscroll-contain">
          {loading ? (
            <div className="py-12 text-center text-sm font-semibold text-slate-400">Cargando información del insumo...</div>
          ) : !ingredient ? (
            <div className="py-12 text-center text-sm font-semibold text-slate-400">No se encontró la información.</div>
          ) : (
            <>
              {activeTab === "compras" && (
                <MovementForm
                  formRef={movementFormRef}
                  ingredient={ingredient}
                  initialAction="PURCHASE"
                  disabledActions={["PURCHASE_RETURN", "ADJUSTMENT_POSITIVE", "ADJUSTMENT_NEGATIVE"]}
                  onSuccess={handleMovementSuccess}
                  compact
                  hideSubmitButton
                  onValidationChange={setMovementFormValid}
                  onSubmittingChange={setMovementFormSubmitting}
                />
              )}

              {activeTab === "kardex" && (
                !kardexLoaded ? (
                  <div className="py-12 text-center text-sm font-semibold text-slate-400">Cargando timeline de Kardex...</div>
                ) : (
                  <KardexList movements={movements} stockUnitLabel={stockUnitLabel} />
                )
              )}

              {activeTab === "insumo" && (
                <div className="space-y-4">
                  {/* Cards 1 & 2 rendered internally by IngredientForm */}
                  <IngredientForm
                    formRef={ingredientFormRef}
                    mode="edit"
                    initial={ingredient}
                    submitting={submitting}
                    onSubmit={handleUpdate}
                    hideSubmitButton
                    hideReadOnlyMetrics
                    onValidationChange={setIngredientFormValid}
                  />

                  {false && (
                  <>
                  {/* Card 3: Presentaciones de compra */}
                  <section className="rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-4">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Bloque C — Compras por caja/pack</p>
                        <p className="text-[10px] font-semibold text-slate-400">Configurá un empaque de compra (por ejemplo, una caja de hamburguesas que contiene 4 medallones de 250 g).</p>
                      </div>
                      {editingPresentationId && (
                        <button
                          type="button"
                          onClick={resetPresentationForm}
                          className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 active:scale-95"
                        >
                          <Plus className="h-3 w-3" /> Nuevo
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del empaque</label>
                        <input
                          value={presentationForm.name}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Ej: Caja de medallones"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidad que compras al proveedor</label>
                        <select
                          value={presentationForm.purchaseUnitId}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, purchaseUnitId: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        >
                          <option value="">Seleccionar...</option>
                          {commercialUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuántas unidades vienen adentro</label>
                        <input
                          value={presentationForm.innerQuantity}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, innerQuantity: e.target.value.replace(/[^0-9.,]/g, "") }))}
                          inputMode="decimal"
                          placeholder="Ej: 4"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del elemento interno</label>
                        <input
                          value={presentationForm.innerUnitLabel}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, innerUnitLabel: e.target.value }))}
                          placeholder="Ej: medallón"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          ¿Cuánto suma cada {presentationForm.innerUnitLabel.trim() || "elemento"} al stock?
                        </label>
                        <input
                          value={presentationForm.contentQuantity}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, contentQuantity: e.target.value.replace(/[^0-9.,]/g, "") }))}
                          inputMode="decimal"
                          placeholder="Ej: 250"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        />
                        {renderContentQuantityHelperText()}
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Unidad que suma al stock
                        </label>
                        <select
                          value={presentationForm.contentUnitId}
                          onChange={(e) => setPresentationForm((prev) => ({ ...prev, contentUnitId: e.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-sm focus:border-emerald-500"
                        >
                          <option value="">Seleccionar...</option>
                          {filteredContentUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name} ({unit.symbol})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Help / Validation / Formula Preview messages */}
                      <div className="col-span-2 space-y-2">
                        {renderHelpText()}
                        {presentationValidationError && (
                          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-[10px] font-bold text-rose-700 leading-normal">
                            {presentationValidationError}
                          </div>
                        )}
                        {(() => {
                          const preview = getDynamicFormulaPreview();
                          if (preview) {
                            return (
                              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 text-[10px] font-extrabold text-emerald-800 text-center uppercase tracking-wider">
                                {preview}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <div className="col-span-2 py-2 border-t border-slate-50 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presentationForm.isDefault}
                            onChange={(e) => setPresentationForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Presentación predeterminada
                        </label>
                      </div>

                      <button
                        type="button"
                        disabled={!canSavePresentation || presentationSubmitting}
                        onClick={() => void handleSavePresentation()}
                        className="col-span-2 h-11 rounded-2xl bg-slate-900 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {editingPresentationId ? "Guardar presentación" : "Agregar presentación"}
                      </button>
                    </div>

                    {/* Presentations List */}
                    {activePresentations.length > 0 && (
                      <div className="mt-4 space-y-2 pt-3 border-t border-slate-50">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Presentaciones Activas</p>
                        {activePresentations.map((presentation) => (
                          <div
                            key={presentation.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Tag className="h-3 w-3 text-slate-400" />
                                {presentation.name}
                                {presentation.isDefault && (
                                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700">
                                    Predet.
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                1 {presentation.purchaseUnit?.symbol ?? "u"} = {presentation.innerQuantity} {presentation.innerUnitLabel || presentation.contentUnit?.symbol} x {presentation.contentQuantity} {presentation.contentUnit?.symbol}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditPresentation(presentation)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600 border border-slate-100 shadow-sm active:scale-90 transition"
                                aria-label="Editar presentación"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeactivatePresentation(presentation.id)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-rose-600 active:scale-90 transition"
                                aria-label="Desactivar presentación"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* WhatsApp Chat Composer Footer */}
        {ingredient && !loading && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
            <WhatsappComposer
              placeholder={activeTab === "compras" ? "Confirmar movimiento" : activeTab === "insumo" ? "Guardar cambios" : "Kardex"}
              value=""
              onChange={() => {}}
              onSubmit={() => {
                const ref = activeTab === "compras" ? movementFormRef : activeTab === "insumo" ? ingredientFormRef : null;
                if (ref?.current) {
                  if (typeof ref.current.requestSubmit === "function") ref.current.requestSubmit();
                  else ref.current.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                }
              }}
              disabled={activeTab === "kardex"}
              isSubmitting={activeTab === "compras" ? movementFormSubmitting : submitting}
              submitDisabled={activeTab === "compras" ? !movementFormValid : activeTab === "insumo" ? !ingredientFormValid : true}
              rightIconVariant="send"
              leftIconVariant="x"
              onPlusClick={onClose}
              plusAriaLabel="Cerrar"
              submitAriaLabel={activeTab === "compras" ? "Confirmar movimiento" : activeTab === "insumo" ? "Guardar cambios" : "Enviar"}
              centerContent={
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activeTab === "compras" ? "Confirmar movimiento" : activeTab === "insumo" ? "Guardar cambios" : "Historial Kardex"}
                    className="block w-full cursor-default select-none bg-transparent text-sm font-bold text-slate-800 outline-none"
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
