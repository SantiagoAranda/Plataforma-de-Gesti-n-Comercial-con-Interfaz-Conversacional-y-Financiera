"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Bell, BookOpen, Package, TriangleAlert } from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";

import AppHeader from "@/src/components/layout/AppHeader";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { InventoryChatActionBar } from "@/src/components/inventory/InventoryChatActionBar";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import { IngredientDetailSheet } from "@/src/components/inventory/IngredientDetailSheet";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { ExpandableRecipeCard } from "@/src/components/inventory/ExpandableRecipeCard";
import { ExpandableServiceConsumptionCard } from "@/src/components/inventory/ExpandableServiceConsumptionCard";
import { SimpleProductList } from "@/src/components/inventory/SimpleProductList";
import { SimpleProductDetailSheet } from "@/src/components/inventory/SimpleProductDetailSheet";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

import {
  createIngredient,
  createPurchasePresentation,
  getInventorySummary,
  getRecipesBulk,
  getSimpleItemsInventorySummary,
  listServiceConsumption,
  type InventorySummaryIngredient,
  type RecipeLine,
  type SimpleItemInventorySummary,
  type ServiceConsumptionItem,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";

type UITab = "recipes" | "ingredients" | "products" | "services";
type SaveBarContext = {
  message: string;
  saveLabel: string;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
} | null;

function recipeStatus(item: Item, lines: RecipeLine[]) {
  const mandatory = lines.filter((line) => !line.isOptional);
  const invalid = lines.some(
    (line) => !line.ingredientId || !Number.isFinite(Number(line.quantityRequired)) || Number(line.quantityRequired) <= 0,
  );

  if (item.inventoryMode === "SIMPLE") {
    const ok = lines.length === 1 && mandatory.length === 1 && !invalid;
    return ok
      ? { label: "Stock simple", tone: "bg-emerald-50 text-emerald-800" }
      : { label: "Sin insumo", tone: "bg-rose-50 text-rose-700" };
  }

  if (!lines.length) return { label: "Sin receta", tone: "bg-rose-50 text-rose-700" };
  if (mandatory.length < 1 || invalid) return { label: "Receta incompleta", tone: "bg-amber-50 text-amber-800" };
  return { label: "Receta configurada", tone: "bg-emerald-50 text-emerald-800" };
}

function InventarioPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<UITab>("recipes");

  // Sync tab state from search params once on mount / update
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    const matchedTab =
      tabParam === "products" || tabParam === "productos" || searchParams?.has("productId")
        ? "products"
        : tabParam === "insumos" || tabParam === "ingredients" || searchParams?.has("ingredientId")
          ? "ingredients"
          : tabParam === "servicios" || tabParam === "services"
            ? "services"
            : "recipes";
    setActiveTab(matchedTab);
  }, [searchParams]);

  const expandedItemId = searchParams?.get("itemId");
  const selectedIngredientIdParam = searchParams?.get("ingredientId") || null;
  const selectedProductIdParam = searchParams?.get("productId") || null;

  const setTab = useCallback((newTab: UITab) => {
    setActiveTab(newTab);
    const alias =
      newTab === "ingredients"
        ? "insumos"
        : newTab === "products"
          ? "productos"
          : newTab === "services"
            ? "servicios"
            : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    window.history.replaceState(null, "", window.location.pathname + "?" + currentParams.toString());
  }, []);

  const [isFormValid, setIsFormValid] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [simpleProducts, setSimpleProducts] = useState<SimpleItemInventorySummary[]>([]);
  const [services, setServices] = useState<ServiceConsumptionItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipesByItemId, setRecipesByItemId] = useState<Record<string, RecipeLine[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [saveBarContext, setSaveBarContext] = useState<SaveBarContext>(null);

  // Sync selectedIngredientId with searchParams if present
  useEffect(() => {
    if (selectedIngredientIdParam) {
      setSelectedIngredientId(selectedIngredientIdParam);
    } else {
      setSelectedIngredientId(null);
    }
  }, [selectedIngredientIdParam]);

  useEffect(() => {
    setSelectedProductId(selectedProductIdParam);
  }, [selectedProductIdParam]);

  const handleSelectIngredient = (id: string) => {
    setSelectedIngredientId(id);
    const alias = activeTab === "ingredients" ? "insumos" : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    currentParams.set("ingredientId", id);
    window.history.replaceState(null, "", window.location.pathname + "?" + currentParams.toString());
  };

  const handleCloseIngredientSheet = () => {
    setSelectedIngredientId(null);
    const alias = activeTab === "ingredients" ? "insumos" : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    currentParams.delete("ingredientId");
    window.history.replaceState(null, "", window.location.pathname + "?" + currentParams.toString());
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.set("productId", id);
    window.history.replaceState(null, "", window.location.pathname + "?" + currentParams.toString());
  };

  const handleCloseProductSheet = () => {
    setSelectedProductId(null);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.delete("productId");
    window.history.replaceState(null, "", window.location.pathname + "?" + currentParams.toString());
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData, simpleProductsData, servicesData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
        getSimpleItemsInventorySummary().catch(() => []),
        listServiceConsumption().catch(() => []),
      ]);

      setSummary(summaryData ?? []);
      setSimpleProducts(simpleProductsData ?? []);
      setItems((itemsData ?? []).filter((item) => item.status === "ACTIVE"));
      setServices(servicesData ?? []);

      const inventoryProducts = (itemsData ?? []).filter(
        (item) => item.status === "ACTIVE" && item.type === "PRODUCT" && item.inventoryMode === "RECIPE_BASED",
      );

      setRecipesByItemId(
        await getRecipesBulk(inventoryProducts.map((item) => item.id)),
      );
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "No se pudo cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inventoryTotalValue = useMemo(
    () => summary.reduce((acc, item) => acc + parseNumber(item.stockValue), 0),
    [summary],
  );

  const alertGroups = useMemo(() => {
    const outOfStock: InventorySummaryIngredient[] = [];
    const lowStock: InventorySummaryIngredient[] = [];

    for (const item of summary) {
      if (item.outOfStock) outOfStock.push(item);
      else if (item.lowStock) lowStock.push(item);
    }

    return { outOfStock, lowStock, count: outOfStock.length + lowStock.length };
  }, [summary]);

  const recipeItems = useMemo(
    () => items.filter((item) => item.type === "PRODUCT" && item.inventoryMode === "RECIPE_BASED"),
    [items],
  );

  const visibleIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return summary;
    return summary.filter((item) => item.name.toLowerCase().includes(query));
  }, [summary, searchQuery]);

  const visibleRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return recipeItems;
    return recipeItems.filter((item) => item.name.toLowerCase().includes(query));
  }, [recipeItems, searchQuery]);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return simpleProducts;
    return simpleProducts.filter((item) => item.name.toLowerCase().includes(query));
  }, [simpleProducts, searchQuery]);

  const visibleServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return services;
    return services.filter((item) => item.name.toLowerCase().includes(query));
  }, [services, searchQuery]);

  const recipeCost = useCallback(
    (itemId: string) => {
      const lines = recipesByItemId[itemId] ?? [];
      if (!lines.length) return null;

      let invalid = false;
      const cost = lines.reduce((acc, line) => {
        const quantity = Number(line.quantityRequired ?? 0);
        const ingredient = summary.find((item) => item.id === line.ingredientId);
        const averageCost = parseNumber(ingredient?.averageCost ?? "0");
        if (!line.ingredientId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCost)) invalid = true;
        return acc + (Number.isFinite(quantity) && Number.isFinite(averageCost) ? quantity * averageCost : 0);
      }, 0);

      return invalid ? null : cost;
    },
    [recipesByItemId, summary],
  );

  const toggleIngredientSheetFromBar = useCallback(() => {
    if (!ingredientSheetOpen) {
      setTab("ingredients");
      setIngredientSheetOpen(true);
    } else {
      setIngredientSheetOpen(false);
    }
  }, [ingredientSheetOpen, setTab]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-neutral-50">
      <div className="shrink-0">
        <AppHeader
          title="Inventario"
          showBack
          hrefBack="/home"
          rightAriaLabel="Alertas de inventario"
          onRightClick={() => setAlertsOpen(true)}
          rightIcon={
            <div className="relative">
              <Bell className="h-5 w-5 text-[#0B3F64]" />
              {alertGroups.count > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
                  {alertGroups.count > 99 ? "99+" : String(alertGroups.count)}
                </span>
              ) : null}
            </div>
          }
        />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-40">
        <div className="mx-auto w-full max-w-md space-y-3 px-4 py-4">
          <section
            className="relative overflow-hidden rounded-2xl p-5 shadow-sm"
            style={{
              background: "#121A28",
              backgroundImage: "linear-gradient(135deg, rgba(18, 26, 40, 1) 0%, rgba(106, 14, 47, 1) 50%, rgba(200, 2, 55, 1) 100%)"
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">INVENTARIO TOTAL</p>
                <p className="mt-1 truncate text-2xl font-bold text-white">${formatMoney(inventoryTotalValue)} COP</p>
              </div>
              <div className="space-y-1.5 border-l border-white/20 pl-4 min-w-[120px]">
                <div className="flex items-center justify-between gap-6 text-xs">
                  <span className="font-medium text-white/90">Recetas</span>
                  <span className="font-bold text-white">{formatMoney(recipeItems.length)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs">
                  <span className="font-medium text-white/90">Alertas</span>
                  <span className="font-bold text-white">{formatMoney(alertGroups.count)}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {(["recipes", "ingredients", "products", "services"] as const).map((nextTab) => (
                <button
                  key={nextTab}
                  type="button"
                  onClick={() => setTab(nextTab)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition flex items-center gap-1.5 active:scale-[0.98]",
                    activeTab === nextTab 
                      ? "bg-[#E6EFF5] text-[#0B3F64] font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80",
                  )}
                >
                  {nextTab === "recipes" ? "Recetas" : nextTab === "ingredients" ? "Insumos" : nextTab === "products" ? "Productos" : "Servicios"}
                </button>
              ))}
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-4 text-center text-sm font-medium text-neutral-400 shadow-sm ring-1 ring-black/5">Cargando...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>
          ) : activeTab === "ingredients" ? (
            <section className="space-y-2">
              <IngredientList ingredients={visibleIngredients} onSelect={handleSelectIngredient} />
            </section>
          ) : activeTab === "products" ? (
            <section className="space-y-2">
              <SimpleProductList products={visibleProducts} onSelect={handleSelectProduct} />
            </section>
          ) : activeTab === "services" ? (
            <section className="space-y-2">
              {visibleServices.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm font-medium text-neutral-500 shadow-sm">
                  No hay servicios para mostrar.
                </div>
              ) : (
                visibleServices.map((service) => (
                  <ExpandableServiceConsumptionCard
                    key={service.id}
                    service={service}
                    allIngredients={summary}
                    onSaveSuccess={load}
                    initiallyExpanded={expandedItemId === service.id}
                  />
                ))
              )}
            </section>
          ) : (
            <section className="space-y-2">
              {visibleRecipes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm font-medium text-neutral-500 shadow-sm">
                  No hay recetas para mostrar.
                </div>
              ) : (
                visibleRecipes.map((item) => (
                  <ExpandableRecipeCard
                    key={item.id}
                    item={item}
                    recipeLines={recipesByItemId[item.id] ?? []}
                    allIngredients={summary}
                    onSaveSuccess={load}
                    initiallyExpanded={expandedItemId === item.id}
                    onSaveContextChange={setSaveBarContext}
                  />
                ))
              )}
            </section>
          )}
        </div>
      </main>

      <InventoryChatActionBar
        mode={saveBarContext ? { type: "SAVE", ...saveBarContext } : { type: "SEARCH" }}
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={
          activeTab === "ingredients"
            ? "Buscar insumo..."
            : activeTab === "products"
              ? "Buscar producto..."
              : activeTab === "services"
                ? "Buscar servicio..."
                : "Buscar receta..."
        }
        onSubmit={() => { }}
        onCreateIngredient={toggleIngredientSheetFromBar}
        createIngredientActive={ingredientSheetOpen}
        isCreatingIngredient={ingredientSheetOpen}
        isFormValid={isFormValid}
        isSubmittingIngredient={creatingIngredient}
        onCancelCreate={() => {
          setIngredientSheetOpen(false);
          setSearchQuery("");
          setIsFormValid(false);
        }}
        onSaveCreate={() => {
          formRef.current?.requestSubmit();
        }}
      />

      <ItemPanelLayout
        open={alertsOpen}
        title="Alertas"
        subtitle={alertGroups.count > 0 ? `${alertGroups.outOfStock.length} faltantes · ${alertGroups.lowStock.length} mínimo` : "Sin alertas"}
        onClose={() => setAlertsOpen(false)}
      >
        {alertGroups.count === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
            Todo OK. No hay insumos con stock crítico o mínimo alcanzado.
          </div>
        ) : (
          <div className="space-y-2">
            {[...alertGroups.outOfStock, ...alertGroups.lowStock].map((item) => {
              const out = alertGroups.outOfStock.some((alert) => alert.id === item.id);
              const unitLabel = getStockUnitSymbol(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setAlertsOpen(false);
                    handleSelectIngredient(item.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{item.name}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                      {out ? "Acción recomendada: cargar stock" : "Acción recomendada: revisar mínimo"} · Stock {formatQuantityCompact(item.currentStock)} {unitLabel}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider", out ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700")}>
                    {out ? "SIN STOCK" : "BAJO"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ItemPanelLayout>

      {ingredientSheetOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => {
              setIngredientSheetOpen(false);
              setIsFormValid(false);
            }}
            aria-hidden
          />

          {/* Unified Bottom Sheet Panel containing Title, Form, & Composer */}
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-2 pointer-events-none">
            <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl border-x border-t border-slate-200/60 pointer-events-auto animate-in slide-in-from-bottom-6 fade-in duration-200">

              {/* Sticky/Fixed Title Header */}
              <div className="shrink-0 bg-white px-5 pt-5 pb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Nuevo ingrediente
                </h2>
              </div>

              {/* Scrollable Form Body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                <IngredientForm
                  key={ingredientSheetOpen ? "create-ingredient-open" : "create-ingredient-closed"}
                  mode="create"
                  defaults={{ name: "" }}
                  submitting={creatingIngredient}
                  hideTitle={true}
                  hideSubmitButton={true}
                  onCancel={() => {
                    setIngredientSheetOpen(false);
                    setIsFormValid(false);
                  }}
                  onSubmit={async (values) => {
                    const loadingId = "inventory-ingredient-create-loading";
                    try {
                      setCreatingIngredient(true);
                      toast.loading("Creando ingrediente...", { id: loadingId });

                      const payload: any = {
                        name: values.name,
                        stockUnitId: values.stockUnitId,
                        defaultPurchaseUnitId: values.defaultPurchaseUnitId,
                        consumptionUnit: values.consumptionUnit,
                        purchaseUnit: values.purchaseUnit,
                        minStock: values.minStock,
                        purchaseToConsumptionFactor: values.purchaseToConsumptionFactor,
                      };
                      const created = await createIngredient(payload);
                      if (values.purchasePresentationDraft) {
                        await createPurchasePresentation(created.id, values.purchasePresentationDraft);
                      }
                      toast.dismiss(loadingId);
                      toast.success("Ingrediente creado");
                      setIngredientSheetOpen(false);
                      setSearchQuery("");
                      setIsFormValid(false);
                      await load();
                    } catch (err) {
                      console.error(err);
                      toast.dismiss(loadingId);
                      toast.error(getErrorMessage(err, "No se pudo crear el ingrediente"));
                    } finally {
                      setCreatingIngredient(false);
                    }
                  }}
                  onValidationChange={setIsFormValid}
                  formRef={formRef}
                />
              </div>

              {/* Composer Footer (Flush with bottom sheet) */}
              <div
                className="shrink-0 border-t border-slate-100 bg-white px-3 py-2"
                style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
              >
                <WhatsappComposer
                  leftAction={() => {
                    setIngredientSheetOpen(false);
                    setSearchQuery("");
                    setIsFormValid(false);
                  }}
                  leftIconVariant="x"
                  rightAction={() => {
                    formRef.current?.requestSubmit();
                  }}
                  submitDisabled={!isFormValid}
                  isSubmitting={creatingIngredient}
                  rightIconVariant="send"
                  className="border-none shadow-none bg-transparent rounded-none p-0"
                  centerContent={
                    <div className="flex h-full w-full items-center justify-center pt-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nuevo insumo</span>
                    </div>
                  }
                />
              </div>

            </div>
          </div>
        </>
      )}

      <IngredientDetailSheet
        ingredientId={selectedIngredientId}
        open={!!selectedIngredientId}
        onClose={handleCloseIngredientSheet}
        onChanged={load}
      />
      <SimpleProductDetailSheet
        product={simpleProducts.find((item) => item.id === selectedProductId) ?? null}
        open={!!selectedProductId}
        onClose={handleCloseProductSheet}
        onChanged={load}
      />
    </div>
  );
}

export default function InventarioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-neutral-50">
          <div className="shrink-0">
            <AppHeader title="Inventario" showBack hrefBack="/home" />
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto pb-40">
            <div className="mx-auto w-full max-w-md space-y-3 px-4 py-4">
              <div className="rounded-2xl bg-white p-4 text-center text-sm font-medium text-neutral-400 shadow-sm ring-1 ring-black/5">
                Cargando inventario...
              </div>
            </div>
          </main>
        </div>
      }
    >
      <InventarioPageContent />
    </Suspense>
  );
}
