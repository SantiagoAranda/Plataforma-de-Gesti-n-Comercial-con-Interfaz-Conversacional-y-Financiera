"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Bell,
  BookOpen,
  Package,
  TriangleAlert,
  Layers3,
  ChefHat,
  Plus,
  Search,
  Send,
} from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";

import AppHeader from "@/src/components/layout/AppHeader";
import { EmptyStateCard } from "@/src/components/shared/EmptyStateCard";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import { IngredientDetailSheet } from "@/src/components/inventory/IngredientDetailSheet";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { ExpandableRecipeCard } from "@/src/components/inventory/ExpandableRecipeCard";
import { ExpandableServiceConsumptionCard } from "@/src/components/inventory/ExpandableServiceConsumptionCard";
import {
  getRecipeOperationalHealth,
  getServiceOperationalHealth,
} from "@/src/components/inventory/inventoryOperationalHealth";
import { SimpleProductList } from "@/src/components/inventory/SimpleProductList";
import { SimpleProductDetailSheet } from "@/src/components/inventory/SimpleProductDetailSheet";

import {
  createIngredient,
  createPurchasePresentation,
  getInventorySummary,
  getInventoryValueSummary,
  getRecipesBulk,
  getSimpleItemsInventorySummary,
  listServiceConsumption,
  type CreateIngredientDto,
  type InventorySummaryIngredient,
  type InventoryValueSummary,
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

const formatInventoryTotal = new Intl.NumberFormat("es-CO", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function recipeStatus(item: Item, lines: RecipeLine[]) {
  const mandatory = lines.filter((line) => !line.isOptional);
  const invalid = lines.some(
    (line) =>
      !line.ingredientId ||
      !Number.isFinite(Number(line.quantityRequired)) ||
      Number(line.quantityRequired) <= 0,
  );

  if (item.inventoryMode === "SIMPLE") {
    const ok = lines.length === 1 && mandatory.length === 1 && !invalid;
    return ok
      ? { label: "Stock simple", tone: "bg-emerald-50 text-emerald-800" }
      : { label: "Sin insumo", tone: "bg-rose-50 text-rose-700" };
  }

  if (!lines.length)
    return { label: "Sin receta", tone: "bg-rose-50 text-rose-700" };
  if (mandatory.length < 1 || invalid)
    return { label: "Receta incompleta", tone: "bg-amber-50 text-amber-800" };
  return {
    label: "Receta configurada",
    tone: "bg-emerald-50 text-emerald-800",
  };
}

function InventarioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<UITab>("recipes");

  // Sync tab state from search params once on mount / update
  useEffect(() => {
    const tabParam = searchParams?.get("tab");
    const matchedTab =
      tabParam === "products" ||
      tabParam === "productos" ||
      searchParams?.has("productId")
        ? "products"
        : tabParam === "insumos" ||
            tabParam === "ingredients" ||
            searchParams?.has("ingredientId")
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
    window.history.replaceState(
      null,
      "",
      window.location.pathname + "?" + currentParams.toString(),
    );
  }, []);

  const [isFormValid, setIsFormValid] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [inventoryValueSummary, setInventoryValueSummary] =
    useState<InventoryValueSummary | null>(null);
  const [simpleProducts, setSimpleProducts] = useState<
    SimpleItemInventorySummary[]
  >([]);
  const [services, setServices] = useState<ServiceConsumptionItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipesByItemId, setRecipesByItemId] = useState<
    Record<string, RecipeLine[]>
  >({});
  const [reviewRecipeItemIds, setReviewRecipeItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [recipeReviewOnly, setRecipeReviewOnly] = useState(false);
  const [serviceReviewOnly, setServiceReviewOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<
    string | null
  >(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
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
    window.history.replaceState(
      null,
      "",
      window.location.pathname + "?" + currentParams.toString(),
    );
  };

  const handleCloseIngredientSheet = () => {
    setSelectedIngredientId(null);
    const alias = activeTab === "ingredients" ? "insumos" : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    currentParams.delete("ingredientId");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + "?" + currentParams.toString(),
    );
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.set("productId", id);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + "?" + currentParams.toString(),
    );
  };

  const handleCloseProductSheet = () => {
    setSelectedProductId(null);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.delete("productId");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + "?" + currentParams.toString(),
    );
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [
        summaryData,
        valueSummaryData,
        itemsData,
        simpleProductsData,
        servicesData,
      ] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        getInventoryValueSummary(),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
        getSimpleItemsInventorySummary().catch(() => []),
        listServiceConsumption().catch(() => []),
      ]);

      setSummary(summaryData ?? []);
      setInventoryValueSummary(valueSummaryData);
      setSimpleProducts(simpleProductsData ?? []);
      setItems((itemsData ?? []).filter((item) => item.status === "ACTIVE"));
      setServices(servicesData ?? []);

      const inventoryProducts = (itemsData ?? []).filter(
        (item) =>
          item.status === "ACTIVE" &&
          item.type === "PRODUCT" &&
          item.inventoryMode === "RECIPE_BASED",
      );

      const recipeItemIds = inventoryProducts.map((item) => item.id);
      const [allRecipes, reviewRecipes] = await Promise.all([
        getRecipesBulk(recipeItemIds),
        getRecipesBulk(recipeItemIds, { requiresReview: true }),
      ]);
      setRecipesByItemId(allRecipes);
      setReviewRecipeItemIds(new Set(Object.keys(reviewRecipes)));
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

  const inventoryTotalValue = parseNumber(
    inventoryValueSummary?.inventoryTotalValue ?? "0",
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
    () =>
      items.filter(
        (item) =>
          item.type === "PRODUCT" && item.inventoryMode === "RECIPE_BASED",
      ),
    [items],
  );

  const visibleIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return summary;
    return summary.filter((item) => item.name.toLowerCase().includes(query));
  }, [summary, searchQuery]);

  const visibleRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return recipeItems.filter(
      (item) =>
        (!recipeReviewOnly ||
          reviewRecipeItemIds.has(item.id) ||
          getRecipeOperationalHealth(
            item,
            recipesByItemId[item.id] ?? [],
            summary,
          ).requiresReview) &&
        (!query || item.name.toLowerCase().includes(query)),
    );
  }, [
    recipeItems,
    recipeReviewOnly,
    reviewRecipeItemIds,
    recipesByItemId,
    searchQuery,
    summary,
  ]);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return simpleProducts;
    return simpleProducts.filter((item) =>
      item.name.toLowerCase().includes(query),
    );
  }, [simpleProducts, searchQuery]);

  const visibleServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return services.filter(
      (item) =>
        (!serviceReviewOnly ||
          getServiceOperationalHealth(item).requiresReview) &&
        (!query || item.name.toLowerCase().includes(query)),
    );
  }, [services, serviceReviewOnly, searchQuery]);

  const recipeCost = useCallback(
    (itemId: string) => {
      const lines = recipesByItemId[itemId] ?? [];
      if (!lines.length) return null;

      let invalid = false;
      const cost = lines.reduce((acc, line) => {
        const quantity = Number(line.quantityRequired ?? 0);
        const ingredient = summary.find(
          (item) => item.id === line.ingredientId,
        );
        const averageCost = parseNumber(ingredient?.averageCost ?? "0");
        if (
          !line.ingredientId ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(averageCost)
        )
          invalid = true;
        return (
          acc +
          (Number.isFinite(quantity) && Number.isFinite(averageCost)
            ? quantity * averageCost
            : 0)
        );
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
              backgroundImage:
                "linear-gradient(135deg, rgba(18, 26, 40, 1) 0%, rgba(106, 14, 47, 1) 50%, rgba(200, 2, 55, 1) 100%)",
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
                  INVENTARIO TOTAL
                </p>
                <p className="mt-1 truncate text-2xl font-bold text-white">
                  ${formatInventoryTotal.format(inventoryTotalValue)}
                </p>
              </div>
              <div className="space-y-1.5 border-l border-white/20 pl-4 min-w-[120px]">
                <div className="flex items-center justify-between gap-6 text-xs">
                  <span className="font-medium text-white/90">Recetas</span>
                  <span className="font-bold text-white">
                    {formatMoney(recipeItems.length)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs">
                  <span className="font-medium text-white/90">Alertas</span>
                  <span className="font-bold text-white">
                    {formatMoney(alertGroups.count)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {(["recipes", "ingredients", "products", "services"] as const).map(
              (nextTab) => (
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
                  {nextTab === "recipes"
                    ? "Recetas"
                    : nextTab === "ingredients"
                      ? "Insumos"
                      : nextTab === "products"
                        ? "Productos"
                        : "Servicios"}
                </button>
              ),
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-4 text-center text-sm font-medium text-neutral-400 shadow-sm ring-1 ring-black/5">
              Cargando...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
              {error}
            </div>
          ) : activeTab === "ingredients" ? (
            <section className="space-y-2">
              <IngredientList
                ingredients={visibleIngredients}
                onSelect={handleSelectIngredient}
              />
            </section>
          ) : activeTab === "products" ? (
            <section className="space-y-2">
              <SimpleProductList
                products={visibleProducts}
                onSelect={handleSelectProduct}
              />
            </section>
          ) : activeTab === "services" ? (
            <section className="space-y-2">
              {visibleServices.length === 0 ? (
                <EmptyStateCard
                  icon={Layers3}
                  title={
                    serviceReviewOnly
                      ? "Sin servicios que requieran revisión"
                      : "Sin servicios configurados"
                  }
                  description={
                    serviceReviewOnly
                      ? "Todos los servicios visibles utilizan ingredientes activos."
                      : "Configura el consumo de insumos por cada prestación de servicio para controlar tu stock automáticamente."
                  }
                />
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
                <EmptyStateCard
                  icon={ChefHat}
                  title={
                    recipeReviewOnly
                      ? "Sin recetas que requieran revisión"
                      : "Sin recetas configuradas"
                  }
                  description={
                    recipeReviewOnly
                      ? "Todas las recetas visibles utilizan ingredientes activos."
                      : "Configura las recetas de tus platos o productos para deducir insumos de inventario en cada venta."
                  }
                />
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

      <ItemPanelLayout
        open={alertsOpen}
        title="Alertas"
        subtitle={
          alertGroups.count > 0
            ? `${alertGroups.outOfStock.length} faltantes · ${alertGroups.lowStock.length} mínimo`
            : "Sin alertas"
        }
        onClose={() => setAlertsOpen(false)}
      >
        {alertGroups.count === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
            Todo OK. No hay insumos con stock crítico o mínimo alcanzado.
          </div>
        ) : (
          <div className="space-y-2">
            {[...alertGroups.outOfStock, ...alertGroups.lowStock].map(
              (item) => {
                const out = alertGroups.outOfStock.some(
                  (alert) => alert.id === item.id,
                );
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
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                        {out
                          ? "Acción recomendada: cargar stock"
                          : "Acción recomendada: revisar mínimo"}{" "}
                        · Stock {formatQuantityCompact(item.currentStock)}{" "}
                        {unitLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        out
                          ? "bg-rose-600 text-white"
                          : "bg-rose-50 text-rose-700",
                      )}
                    >
                      {out ? "SIN STOCK" : "BAJO"}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        )}
      </ItemPanelLayout>

      {/* Floating Chat & Expandable Form Architecture (Identical to Sales / Accounting / Mi Negocio) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] bg-transparent px-3 py-3 lg:left-[408px] lg:right-0">
        <div className="mx-auto w-full max-w-3xl">
          <div className="relative">
          {ingredientSheetOpen && (
            <>
              {/* Overlay Backdrop - Dark without blur */}
              <div
                className="pointer-events-auto fixed inset-0 z-40 bg-black/40 transition-opacity"
                onClick={() => {
                  setIngredientSheetOpen(false);
                  setIsFormValid(false);
                }}
                aria-hidden
              />

              {/* Expandable Form Panel Floating Above Chat Bar */}
              <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 flex max-h-[min(70vh,580px)] flex-col overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.08)] animate-in slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="shrink-0 bg-white px-5 pt-5 pb-3 border-b border-slate-100/60">
                  <h2 className="text-base font-semibold text-slate-900">
                    Nuevo ingrediente
                  </h2>
                </div>

                {/* Form Body */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                  <IngredientForm
                    key={
                      ingredientSheetOpen
                        ? "create-ingredient-open"
                        : "create-ingredient-closed"
                    }
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
                        toast.loading("Creando ingrediente...", {
                          id: loadingId,
                        });

                        const payload: CreateIngredientDto = {
                          name: values.name,
                          stockUnitId: values.stockUnitId,
                          defaultPurchaseUnitId: values.defaultPurchaseUnitId,
                          consumptionUnit: values.consumptionUnit,
                          purchaseUnit: values.purchaseUnit,
                          minStock: values.minStock,
                          purchaseToConsumptionFactor:
                            values.purchaseToConsumptionFactor,
                        };
                        const created = await createIngredient(payload);
                        if (values.purchasePresentationDraft) {
                          try {
                            await createPurchasePresentation(
                              created.id,
                              values.purchasePresentationDraft,
                            );
                          } catch (presentationError) {
                            console.error(presentationError);
                            toast.dismiss(loadingId);
                            toast.error(
                              "El ingrediente fue creado, pero no se pudo guardar la presentación de compra. Puede completarla desde Editar ingrediente.",
                              { duration: 6500 },
                            );
                            router.push(
                              `/inventario/ingredientes/${created.id}/editar`,
                            );
                            return;
                          }
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
                        toast.error(
                          getErrorMessage(
                            err,
                            "No se pudo crear el ingrediente",
                          ),
                        );
                      } finally {
                        setCreatingIngredient(false);
                      }
                    }}
                    onValidationChange={setIsFormValid}
                    formRef={formRef}
                  />
                </div>
              </div>
            </>
          )}

          {/* Floating Action / Chat Composer Bar */}
          <div className="pointer-events-auto rounded-3xl border border-slate-200 bg-white p-2">
            <form
              className="flex min-w-0 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (saveBarContext) {
                  void saveBarContext.onSave();
                } else if (ingredientSheetOpen) {
                  formRef.current?.requestSubmit();
                }
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (saveBarContext) {
                    saveBarContext.onDiscard();
                  } else if (ingredientSheetOpen) {
                    setIngredientSheetOpen(false);
                    setSearchQuery("");
                    setIsFormValid(false);
                  } else {
                    toggleIngredientSheetFromBar();
                  }
                }}
                disabled={saveBarContext?.isSaving || creatingIngredient}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100/80 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3F64]/30 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                aria-label={
                  saveBarContext
                    ? "Descartar cambios"
                    : ingredientSheetOpen
                      ? "Cancelar nuevo ingrediente"
                      : "Nuevo ingrediente"
                }
              >
                <Plus
                  className={cn(
                    "h-5 w-5 transition-transform duration-300 ease-in-out",
                    saveBarContext || ingredientSheetOpen
                      ? "rotate-[135deg]"
                      : "rotate-0",
                  )}
                />
              </button>

              {saveBarContext ? (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {saveBarContext.message}
                </span>
              ) : ingredientSheetOpen ? (
                <span className="min-w-0 flex-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Nuevo insumo
                </span>
              ) : (
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={
                    activeTab === "ingredients"
                      ? "Buscar insumo..."
                      : activeTab === "products"
                        ? "Buscar producto..."
                        : activeTab === "services"
                          ? "Buscar servicio..."
                          : "Buscar receta..."
                  }
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              )}

              <button
                type="submit"
                disabled={
                  saveBarContext?.isSaving ||
                  creatingIngredient ||
                  (ingredientSheetOpen && !isFormValid)
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B3F64] text-white transition hover:bg-[#0B3F64]/90 focus:outline-none focus:ring-2 focus:ring-[#0B3F64]/35 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                aria-label={
                  saveBarContext?.saveLabel ??
                  (ingredientSheetOpen ? "Guardar ingrediente" : "Buscar")
                }
              >
                {saveBarContext || ingredientSheetOpen ? (
                  <Send className="h-4 w-4" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </form>
            {!saveBarContext &&
              !ingredientSheetOpen &&
              (activeTab === "recipes" || activeTab === "services") && (
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1 sm:pl-12 sm:pr-2">
                {[
                  { label: "Todas", value: false },
                  { label: "Requieren revisión", value: true },
                ].map((option) => {
                  const selected =
                    activeTab === "recipes"
                      ? recipeReviewOnly === option.value
                      : serviceReviewOnly === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() =>
                        activeTab === "recipes"
                          ? setRecipeReviewOnly(option.value)
                          : setServiceReviewOnly(option.value)
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        selected
                          ? "border-[#0B3F64] bg-[#E6EFF5] font-semibold text-[#0B3F64]"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <IngredientDetailSheet
        ingredientId={selectedIngredientId}
        open={!!selectedIngredientId}
        onClose={handleCloseIngredientSheet}
        onChanged={load}
      />
      <SimpleProductDetailSheet
        product={
          simpleProducts.find((item) => item.id === selectedProductId) ?? null
        }
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
