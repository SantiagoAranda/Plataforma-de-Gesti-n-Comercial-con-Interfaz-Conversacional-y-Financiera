"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Bell, BookOpen, Package, TriangleAlert } from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney } from "@/src/lib/formatters";

import AppHeader from "@/src/components/layout/AppHeader";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { InventoryChatActionBar } from "@/src/components/inventory/InventoryChatActionBar";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import { IngredientDetailSheet } from "@/src/components/inventory/IngredientDetailSheet";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { getStockUnitSymbol } from "@/src/components/inventory/inventoryUnits";
import { ExpandableRecipeCard } from "@/src/components/inventory/ExpandableRecipeCard";
import { SimpleProductList } from "@/src/components/inventory/SimpleProductList";
import { SimpleProductDetailSheet } from "@/src/components/inventory/SimpleProductDetailSheet";

import {
  createIngredient,
  getInventorySummary,
  getRecipesBulk,
  getSimpleItemsInventorySummary,
  type InventorySummaryIngredient,
  type RecipeLine,
  type SimpleItemInventorySummary,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";

type UITab = "recipes" | "ingredients" | "products";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const tab =
    tabParam === "products" || tabParam === "productos" || searchParams?.has("productId")
      ? "products"
      : tabParam === "insumos" || tabParam === "ingredients" || searchParams?.has("ingredientId")
        ? "ingredients"
        : "recipes";
  const expandedItemId = searchParams?.get("itemId");
  const selectedIngredientIdParam = searchParams?.get("ingredientId") || null;
  const selectedProductIdParam = searchParams?.get("productId") || null;

  const setTab = (newTab: UITab) => {
    const alias = newTab === "ingredients" ? "insumos" : newTab === "products" ? "productos" : "recipes";
    router.push(`/inventario?tab=${alias}`, { scroll: false });
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [simpleProducts, setSimpleProducts] = useState<SimpleItemInventorySummary[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipesByItemId, setRecipesByItemId] = useState<Record<string, RecipeLine[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

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
    const alias = tab === "ingredients" ? "insumos" : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    currentParams.set("ingredientId", id);
    router.push(`/inventario?${currentParams.toString()}`, { scroll: false });
  };

  const handleCloseIngredientSheet = () => {
    setSelectedIngredientId(null);
    const alias = tab === "ingredients" ? "insumos" : "recipes";
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", alias);
    currentParams.delete("ingredientId");
    router.push(`/inventario?${currentParams.toString()}`, { scroll: false });
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.set("productId", id);
    router.push(`/inventario?${currentParams.toString()}`, { scroll: false });
  };

  const handleCloseProductSheet = () => {
    setSelectedProductId(null);
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("tab", "productos");
    currentParams.delete("productId");
    router.push(`/inventario?${currentParams.toString()}`, { scroll: false });
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData, simpleProductsData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
        getSimpleItemsInventorySummary().catch(() => []),
      ]);

      setSummary(summaryData ?? []);
      setSimpleProducts(simpleProductsData ?? []);
      setItems((itemsData ?? []).filter((item) => item.status === "ACTIVE"));

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
    setIngredientSheetOpen((open) => !open);
  }, []);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader
          title="Inventario"
          showBack
          hrefBack="/home"
          rightAriaLabel="Alertas de inventario"
          onRightClick={() => setAlertsOpen(true)}
          rightIcon={
            <div className="relative">
              <Bell className="h-5 w-5" />
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
          <section className="relative overflow-hidden rounded-2xl bg-[#0B1220] p-4 shadow-sm ring-1 ring-black/10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">INVENTARIO TOTAL</p>
                <p className="mt-1 truncate text-2xl font-semibold text-white">${formatMoney(inventoryTotalValue)} COP</p>
              </div>
              <div className="space-y-1 border-l border-white/10 pl-4">
                <div className="flex items-baseline justify-between gap-6 text-xs font-medium text-white/70">
                  <span>Recetas</span>
                  <span className="font-semibold text-white">{formatMoney(recipeItems.length)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-6 text-xs font-medium text-white/70">
                  <span>Alertas</span>
                  <span className="font-semibold text-rose-300">{formatMoney(alertGroups.count)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-full bg-slate-100 p-1 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-3 gap-1">
              {(["recipes", "ingredients", "products"] as const).map((nextTab) => (
                <button
                  key={nextTab}
                  type="button"
                  onClick={() => setTab(nextTab)}
                  className={cn(
                    "h-9 rounded-full text-xs font-bold transition-all active:scale-[0.98]",
                    tab === nextTab ? "bg-slate-900 text-white shadow-md" : "bg-transparent text-slate-500 hover:text-slate-800",
                  )}
                >
                  {nextTab === "recipes" ? "Recetas" : nextTab === "ingredients" ? "Insumos" : "Productos"}
                </button>
              ))}
            </div>
          </section>

          {loading ? (
            <div className="rounded-2xl bg-white p-4 text-center text-sm font-medium text-neutral-400 shadow-sm ring-1 ring-black/5">Cargando...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>
          ) : tab === "ingredients" ? (
            <section className="space-y-2">
              <IngredientList ingredients={visibleIngredients} onSelect={handleSelectIngredient} />
            </section>
          ) : tab === "products" ? (
            <section className="space-y-2">
              <SimpleProductList products={visibleProducts} onSelect={handleSelectProduct} />
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
                  />
                ))
              )}
            </section>
          )}
        </div>
      </main>

      <InventoryChatActionBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={tab === "ingredients" ? "Buscar insumo..." : tab === "products" ? "Buscar producto..." : "Buscar receta..."}
        onSubmit={() => {}}
        onCreateIngredient={toggleIngredientSheetFromBar}
        createIngredientActive={ingredientSheetOpen}
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
                      {out ? "Acción recomendada: cargar stock" : "Acción recomendada: revisar mínimo"} · Stock {formatMoney(parseNumber(item.currentStock))} {unitLabel}
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

      <ItemPanelLayout open={ingredientSheetOpen} title="Nuevo ingrediente" subtitle="Crear insumo" onClose={() => setIngredientSheetOpen(false)}>
        <IngredientForm
          key={ingredientSheetOpen ? "create-ingredient-open" : "create-ingredient-closed"}
          mode="create"
          defaults={{ name: "" }}
          submitting={creatingIngredient}
          onCancel={() => setIngredientSheetOpen(false)}
          onSubmit={async (values) => {
            const loadingId = "inventory-ingredient-create-loading";
            try {
              setCreatingIngredient(true);
              toast.loading("Creando ingrediente...", { id: loadingId });
              
              const payload: any = {
                name: values.name,
                stockUnitId: values.stockUnitId,
                defaultPurchaseUnitId: values.defaultPurchaseUnitId,
                minStock: values.minStock,
              };
              await createIngredient(payload);
              toast.dismiss(loadingId);
              toast.success("Ingrediente creado");
              setIngredientSheetOpen(false);
              setSearchQuery("");
              await load();
            } catch (err) {
              console.error(err);
              toast.dismiss(loadingId);
              toast.error(getErrorMessage(err, "No se pudo crear el ingrediente"));
            } finally {
              setCreatingIngredient(false);
            }
          }}
        />
      </ItemPanelLayout>

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
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
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
