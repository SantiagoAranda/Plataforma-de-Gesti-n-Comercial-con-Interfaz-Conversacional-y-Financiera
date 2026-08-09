"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, Edit2, Power, Trash2, X, Plus } from "lucide-react";

import { cn } from "@/src/lib/utils";
import {
  createPurchasePresentation,
  deactivateIngredient,
  deactivatePurchasePresentation,
  getIngredient,
  listKardex,
  listUnitConversions,
  listUnits,
  updateIngredient,
  updatePurchasePresentation,
  type Ingredient,
  type IngredientPurchasePresentation,
  type InventoryMovement,
  type Unit,
  type UnitConversion,
  type UpdateIngredientDto,
} from "@/src/services/inventory";
import { formatStockHeader } from "@/src/components/inventory/inventoryUnits";
import { IngredientForm, type IngredientFormValues } from "./IngredientForm";
import { MovementForm } from "./MovementForm";
import { KardexList } from "./KardexList";
import {
  directConversionFactor,
  formatQuantity,
  positiveDecimal,
  presentationFactorFromFields,
} from "./purchasePresentation";
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
  const [kardexLoaded, setKardexLoaded] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movementFormValid, setMovementFormValid] = useState(false);
  const [movementFormSubmitting, setMovementFormSubmitting] = useState(false);
  const [ingredientFormValid, setIngredientFormValid] = useState(false);
  const [presentationSubmitting, setPresentationSubmitting] = useState(false);
  const [editingPresentationId, setEditingPresentationId] = useState<
    string | null
  >(null);
  const [presentationForm, setPresentationForm] = useState(
    emptyPresentationForm,
  );

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
      const [ingData, unitsData, conversionData] = await Promise.all([
        getIngredient(id),
        listUnits().catch(() => []),
        listUnitConversions().catch(() => []),
      ]);
      setIngredient(ingData);
      setUnits(unitsData);
      setConversions(conversionData);
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
    setConversions([]);
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
    return contentUnits.filter(
      (unit) =>
        directConversionFactor(unit.id, stockUnit.id, conversions) !== null,
    );
  })();

  const getPresentationValidationError = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    const contentUnit = units.find(
      (u) => u.id === presentationForm.contentUnitId,
    );
    if (!contentUnit) return null;

    return directConversionFactor(contentUnit.id, stockUnit.id, conversions) ===
      null
      ? "La unidad del contenido no tiene una conversión directa hacia la unidad base del stock."
      : null;
  };

  const renderHelpText = () => {
    const stockUnit = getIngredientStockUnit();
    if (!stockUnit) return null;

    if (stockUnit.code === "UNIT") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por unidades. Para un pack de 6 latas, cargá:
          6 latas × 1 unidad.
        </p>
      );
    }
    if (stockUnit.code === "ML" || stockUnit.code === "L") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por volumen. Para un pack de 6 latas de 354
          ml, cargá: 6 latas × 354 ml.
        </p>
      );
    }
    if (stockUnit.code === "G" || stockUnit.code === "KG") {
      return (
        <p className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50 leading-normal">
          Este insumo se controla por peso. Para una caja de 4 medallones de 250
          g, cargá: 4 medallón × 250 g.
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
      const formattedQty = presentationForm.contentQuantity
        ? `${presentationForm.contentQuantity} g`
        : "250 g";
      return (
        <span className="text-[10px] text-slate-500 font-medium mt-1 block">
          Ejemplo: Cada {innerUnit} contiene {formattedQty}
        </span>
      );
    }
    if (stockUnit.code === "ML" || stockUnit.code === "L") {
      const formattedQty = presentationForm.contentQuantity
        ? `${presentationForm.contentQuantity} ml`
        : "500 ml";
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

    const purchaseUnitName =
      commercialUnits
        .find((u) => u.id === presentationForm.purchaseUnitId)
        ?.name?.toLowerCase() || "empaque";
    const innerQuantity = Number(
      presentationForm.innerQuantity.replace(",", "."),
    );
    const innerUnitLabel =
      presentationForm.innerUnitLabel.trim() || "elementos";
    const contentQuantity = Number(
      presentationForm.contentQuantity.replace(",", "."),
    );
    const contentUnit = units.find(
      (u) => u.id === presentationForm.contentUnitId,
    );
    if (!contentUnit) return null;

    if (
      !presentationForm.purchaseUnitId ||
      isNaN(innerQuantity) ||
      innerQuantity <= 0 ||
      isNaN(contentQuantity) ||
      contentQuantity <= 0
    ) {
      return null;
    }

    const totalStockQty = presentationFactorFromFields(
      presentationForm.innerQuantity,
      presentationForm.contentQuantity,
      presentationForm.contentUnitId,
      stockUnit.id,
      conversions,
    );
    if (totalStockQty === null) return null;
    const formattedTotal = formatQuantity(totalStockQty);
    const stockUnitSymbol = stockUnit.symbol ?? stockUnit.code.toLowerCase();

    return `1 ${purchaseUnitName} = ${innerQuantity} ${innerUnitLabel} × ${contentQuantity} ${contentUnit.symbol} = ${formattedTotal} ${stockUnitSymbol}`;
  };

  const presentationValidationError = getPresentationValidationError();
  const activePresentations =
    ingredient?.purchasePresentations?.filter(
      (presentation) => presentation.isActive,
    ) ?? [];
  const editablePresentations = activePresentations.filter(
    (presentation) => !presentation.isLocked,
  );
  const canSavePresentation =
    Boolean(presentationForm.name.trim()) &&
    Boolean(presentationForm.purchaseUnitId) &&
    Boolean(presentationForm.contentUnitId) &&
    positiveDecimal(presentationForm.innerQuantity) &&
    Boolean(presentationForm.innerUnitLabel.trim()) &&
    positiveDecimal(presentationForm.contentQuantity) &&
    !presentationValidationError;

  const tabs: { id: TabType; label: string }[] = [
    { id: "compras", label: "Compras" },
    { id: "kardex", label: "Kardex" },
    { id: "insumo", label: "Insumo" },
  ];

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() =>
      contentRef.current?.scrollTo({ top: 0 }),
    );
    if (tab === "kardex" && ingredientId && !kardexLoaded) {
      void loadKardexData(ingredientId);
    }
  };

  const handleDeactivate = async () => {
    if (!ingredient) return;
    if (!window.confirm(`¿Desactivar el ingrediente "${ingredient.name}"?`))
      return;

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

  const handleUpdate = async (values: IngredientFormValues) => {
    if (!ingredient) return;
    setSubmitting(true);
    const toastId = toast.loading("Guardando cambios...");
    try {
      const payload: UpdateIngredientDto = {
        name: values.name,
        stockUnitId: values.stockUnitId,
        defaultPurchaseUnitId: values.defaultPurchaseUnitId,
        minStock: values.minStock,
        status: values.status,
      };
      await updateIngredient(ingredient.id, payload);
      const presentationDraft = values.purchasePresentationDraft;
      if (presentationDraft) {
        const existingPresentation = ingredient.purchasePresentations?.find(
          (presentation) =>
            !presentation.isLocked &&
            presentation.purchaseUnitId === presentationDraft.purchaseUnitId,
        );
        if (existingPresentation) {
          await updatePurchasePresentation(
            ingredient.id,
            existingPresentation.id,
            presentationDraft,
          );
        } else {
          await createPurchasePresentation(ingredient.id, presentationDraft);
        }
      }
      const refreshed = await getIngredient(ingredient.id);
      setIngredient(refreshed);
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

  const startEditPresentation = (
    presentation: IngredientPurchasePresentation,
  ) => {
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
    const toastId = toast.loading(
      editingPresentationId
        ? "Actualizando presentación..."
        : "Creando presentación...",
    );
    try {
      const payload = {
        name: presentationForm.name.trim(),
        purchaseUnitId: presentationForm.purchaseUnitId,
        innerQuantity: presentationForm.innerQuantity,
        innerUnitLabel: presentationForm.innerUnitLabel.trim(),
        contentQuantity: presentationForm.contentQuantity,
        contentUnitId: presentationForm.contentUnitId,
        isDefault: presentationForm.isDefault,
        isActive: true,
      };
      if (editingPresentationId) {
        await updatePurchasePresentation(
          ingredient.id,
          editingPresentationId,
          payload,
        );
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
    if (!window.confirm("¿Estás seguro de desactivar esta presentación?"))
      return;
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-3 py-3 lg:left-[408px] lg:right-0 pointer-events-none"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-md relative pointer-events-auto">
        <div className="relative">
          {/* Overlay Backdrop - Dark without blur */}
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity"
            onClick={onClose}
            aria-hidden
          />

          {/* Floating Detail Panel (4-side rounded card floating 12px above chat bar) */}
          <div className="pointer-events-auto absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 flex max-h-[min(70vh,580px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            {/* Header container */}
            <div className="shrink-0 border-b border-slate-100/60 bg-white px-5 pb-3 pt-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold text-slate-800">
                    {loading
                      ? "Cargando..."
                      : ingredient?.name || "Detalle de Insumo"}
                  </h2>
                  {ingredient && !loading && stockHeader ? (
                    <div className="mt-1 text-xs font-normal text-slate-400 space-y-0.5 leading-tight">
                      <p>
                        Stock:{" "}
                        <span className="font-medium text-slate-600">
                          {stockHeader.stockText}
                        </span>{" "}
                        · Prom:{" "}
                        <span className="font-medium text-slate-600">
                          {stockHeader.averageCostText}
                        </span>{" "}
                        · Mín:{" "}
                        <span className="font-medium text-slate-600">
                          {stockHeader.minStockText}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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

              {/* Pill Tabs Selector (Identical to Inventory main tabs) */}
              <div className="flex gap-2 min-w-0 flex-1 items-center py-0.5">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id)}
                      className={cn(
                        "flex-1 rounded-full py-2 text-xs font-semibold transition-all active:scale-[0.98]",
                        isActive
                          ? "bg-[#E0E7FF] text-[#0B3F64] shadow-none"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 font-medium",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div
              ref={contentRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-5 py-4 custom-scrollbar overscroll-contain"
            >
              {loading ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">
                  Cargando información del insumo...
                </div>
              ) : !ingredient ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">
                  No se encontró la información.
                </div>
              ) : (
                <>
                  {activeTab === "compras" && (
                    <MovementForm
                      formRef={movementFormRef}
                      ingredient={ingredient}
                      initialAction="PURCHASE"
                      disabledActions={[
                        "PURCHASE_RETURN",
                        "ADJUSTMENT_POSITIVE",
                        "ADJUSTMENT_NEGATIVE",
                      ]}
                      onSuccess={handleMovementSuccess}
                      compact
                      hideSubmitButton
                      onValidationChange={setMovementFormValid}
                      onSubmittingChange={setMovementFormSubmitting}
                    />
                  )}

                  {activeTab === "kardex" &&
                    (!kardexLoaded ? (
                      <div className="py-12 text-center text-sm font-semibold text-slate-400">
                        Cargando timeline de Kardex...
                      </div>
                    ) : (
                      <KardexList
                        movements={movements}
                        stockUnitLabel={stockUnitLabel}
                      />
                    ))}

                  {activeTab === "insumo" && (
                    <div className="space-y-4">
                      {/* Ingredient Edit Form */}
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

                      <section className="space-y-3 border-t border-slate-100 pt-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              Presentaciones de compra
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Configura cada empaque comercial por separado.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={resetPresentationForm}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700"
                          >
                            <Plus className="h-3.5 w-3.5" /> Nueva
                          </button>
                        </div>

                        {editablePresentations.length ? (
                          <div className="space-y-2">
                            {editablePresentations.map((presentation) => {
                              const factor = Number(
                                presentation.factorToBaseUnit,
                              );
                              const purchaseLabel =
                                presentation.purchaseUnit?.symbol ||
                                presentation.purchaseUnit?.name ||
                                presentation.name;
                              const contentLabel =
                                presentation.contentUnit?.symbol ||
                                presentation.contentUnit?.name ||
                                "";
                              return (
                                <div
                                  key={presentation.id}
                                  className="rounded-2xl border border-slate-200 bg-white p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                          {presentation.name}
                                        </p>
                                        {presentation.isDefault ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                                            <Check className="h-3 w-3" />{" "}
                                            Predeterminada
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        1 {purchaseLabel} ={" "}
                                        {presentation.innerQuantity}{" "}
                                        {presentation.innerUnitLabel ||
                                          "unidades"}{" "}
                                        × {presentation.contentQuantity}{" "}
                                        {contentLabel}
                                        {Number.isFinite(factor) && factor > 0
                                          ? ` = ${formatQuantity(factor)} ${stockUnitLabel}`
                                          : ""}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          startEditPresentation(presentation)
                                        }
                                        className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600"
                                        aria-label="Editar presentación"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleDeactivatePresentation(
                                            presentation.id,
                                          )
                                        }
                                        className="grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-rose-600"
                                        aria-label="Desactivar presentación"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                            No hay presentaciones comerciales configuradas.
                          </p>
                        )}

                        <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                          <div className="grid grid-cols-2 gap-3">
                            <label className="col-span-2 space-y-1 text-[11px] font-medium text-slate-600">
                              Nombre de la presentación
                              <input
                                value={presentationForm.name}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                placeholder="Caja"
                              />
                            </label>
                            <label className="col-span-2 space-y-1 text-[11px] font-medium text-slate-600">
                              Presentación mayor
                              <select
                                value={presentationForm.purchaseUnitId}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    purchaseUnitId: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="">Seleccionar...</option>
                                {commercialUnits.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {unit.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-[11px] font-medium text-slate-600">
                              Cantidad contenida
                              <input
                                value={presentationForm.innerQuantity}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    innerQuantity: event.target.value.replace(
                                      /[^0-9.,]/g,
                                      "",
                                    ),
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                inputMode="decimal"
                                placeholder="24"
                              />
                            </label>
                            <label className="space-y-1 text-[11px] font-medium text-slate-600">
                              Unidad contenida
                              <input
                                value={presentationForm.innerUnitLabel}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    innerUnitLabel: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                placeholder="paquete"
                              />
                            </label>
                            <label className="space-y-1 text-[11px] font-medium text-slate-600">
                              Contenido por unidad
                              <input
                                value={presentationForm.contentQuantity}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    contentQuantity: event.target.value.replace(
                                      /[^0-9.,]/g,
                                      "",
                                    ),
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                                inputMode="decimal"
                                placeholder="500"
                              />
                            </label>
                            <label className="space-y-1 text-[11px] font-medium text-slate-600">
                              Unidad del contenido
                              <select
                                value={presentationForm.contentUnitId}
                                onChange={(event) =>
                                  setPresentationForm((current) => ({
                                    ...current,
                                    contentUnitId: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="">Seleccionar...</option>
                                {filteredContentUnits.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {unit.name} ({unit.symbol})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {renderHelpText()}
                          {renderContentQuantityHelperText()}
                          {presentationValidationError ? (
                            <p className="text-xs font-medium text-rose-600">
                              {presentationValidationError}
                            </p>
                          ) : null}
                          {getDynamicFormulaPreview() ? (
                            <p className="rounded-xl bg-white p-2.5 text-xs font-semibold text-emerald-800">
                              {getDynamicFormulaPreview()}
                            </p>
                          ) : null}
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={presentationForm.isDefault}
                              disabled={Boolean(
                                editingPresentationId &&
                                editablePresentations.find(
                                  (item) => item.id === editingPresentationId,
                                )?.isDefault,
                              )}
                              onChange={(event) =>
                                setPresentationForm((current) => ({
                                  ...current,
                                  isDefault: event.target.checked,
                                }))
                              }
                            />
                            Presentación predeterminada
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={resetPresentationForm}
                              className="rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-600"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={
                                !canSavePresentation || presentationSubmitting
                              }
                              onClick={() => void handleSavePresentation()}
                              className="rounded-xl bg-indigo-700 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {presentationSubmitting
                                ? "Guardando..."
                                : editingPresentationId
                                  ? "Actualizar"
                                  : "Agregar"}
                            </button>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Isolated Floating WhatsApp Chat Composer Footer */}
          {ingredient && !loading && (
            <div className="relative z-50">
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
                  const ref =
                    activeTab === "compras"
                      ? movementFormRef
                      : activeTab === "insumo"
                        ? ingredientFormRef
                        : null;
                  if (ref?.current) {
                    if (typeof ref.current.requestSubmit === "function")
                      ref.current.requestSubmit();
                    else
                      ref.current.dispatchEvent(
                        new Event("submit", {
                          cancelable: true,
                          bubbles: true,
                        }),
                      );
                  }
                }}
                disabled={activeTab === "kardex"}
                isSubmitting={
                  activeTab === "compras" ? movementFormSubmitting : submitting
                }
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
                className="rounded-[24px] border border-slate-200 bg-white p-1 shadow-md"
                centerContent={
                  <div className="flex h-full w-full items-center justify-center pt-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {activeTab === "compras"
                        ? "Confirmar movimiento"
                        : activeTab === "insumo"
                          ? "Guardar cambios"
                          : "Historial Kardex"}
                    </span>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
