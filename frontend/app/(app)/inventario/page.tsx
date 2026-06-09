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
import { IngredientDetailSheet } from "@/src/components/inventory/IngredientDetailSheet";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatIngredientUnit } from "@/src/components/inventory/unitLabels";
import { ExpandableRecipeCard } from "@/src/components/inventory/ExpandableRecipeCard";

import {
  createIngredient,
  getInventorySummary,
  getRecipesBulk,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";

type UITab = "recipes" | "ingredients";

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
  const tab = tabParam === "insumos" || tabParam === "ingredients" || searchParams?.has("ingredientId") ? "ingredients" : "recipes";
  const expandedItemId = searchParams?.get("itemId");
  const selectedIngredientIdParam = searchParams?.get("ingredientId") || null;

  const setTab = (newTab: UITab) => {
    const alias = newTab === "ingredients" ? "insumos" : "recipes";
    router.push(`/inventario?tab=${alias}`, { scroll: false });
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipesByItemId, setRecipesByItemId] = useState<Record<string, RecipeLine[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);

  // Sync selectedIngredientId with searchParams if present
  useEffect(() => {
    if (selectedIngredientIdParam) {
      setSelectedIngredientId(selectedIngredientIdParam);
    } else {
      setSelectedIngredientId(null);
    }
  }, [selectedIngredientIdParam]);

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
      ]);

      setSummary(summaryData ?? []);
      setItems((itemsData ?? []).filter((item) => item.status === "ACTIVE"));

      const inventoryProducts = (itemsData ?? []).filter(
        (item) => item.status === "ACTIVE" && item.type === "PRODUCT" && (item.inventoryMode === "SIMPLE" || item.inventoryMode === "RECIPE_BASED"),
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
    () => items.filter((item) => item.type === "PRODUCT" && (item.inventoryMode === "SIMPLE" || item.inventoryMode === "RECIPE_BASED")),
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
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black leading-none text-white">
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
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">INVENTARIO TOTAL</p>
                <p className="mt-1 truncate text-2xl font-black text-white">${formatMoney(inventoryTotalValue)} COP</p>
              </div>
              <div className="space-y-1 border-l border-white/10 pl-4">
                <div className="flex items-baseline justify-between gap-6 text-xs font-bold text-white/70">
                  <span>Recetas</span>
                  <span className="font-black text-white">{formatMoney(recipeItems.length)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-6 text-xs font-bold text-white/70">
                  <span>Alertas</span>
                  <span className="font-black text-rose-300">{formatMoney(alertGroups.count)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-neutral-100/80 p-1.5 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-1.5">
              {(["recipes", "ingredients"] as const).map((nextTab) => (
                <button
                  key={nextTab}
                  type="button"
                  onClick={() => setTab(nextTab)}
                  className={cn(
                    "h-9 rounded-2xl text-xs font-black transition active:scale-[0.99]",
                    tab === nextTab ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5" : "bg-transparent text-neutral-500",
                  )}
                >
                  {nextTab === "recipes" ? "Recetas" : "Insumos"}
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
              {visibleIngredients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm font-medium text-neutral-500 shadow-sm">
                  No hay insumos para mostrar.
                </div>
              ) : (
                visibleIngredients.map((item) => {
                  const currentStock = parseNumber(item.currentStock);
                  const outOfStock = !!item.outOfStock;
                  const lowStock = !!item.lowStock;
                  const unitLabel = formatIngredientUnit(item);
                  const averageCost = parseNumber(item.averageCost);
                  const warning = outOfStock || lowStock;
                  const badge = outOfStock
                    ? { label: "SIN STOCK", tone: "bg-rose-600 text-white" }
                    : lowStock
                      ? { label: "BAJO", tone: "bg-rose-50 text-rose-700 ring-1 ring-rose-100" }
                      : { label: `${formatMoney(currentStock)} ${unitLabel}`.trim(), tone: "bg-neutral-100 text-neutral-700" };

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectIngredient(item.id)}
                      className={cn("w-full rounded-2xl p-3 text-left shadow-sm ring-1 transition active:scale-[0.99]", warning ? "bg-rose-50/70 ring-rose-100" : "bg-white ring-black/5")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-sm font-black text-neutral-700 ring-1 ring-black/5">
                          {(item.name ?? "I").trim().slice(0, 1).toUpperCase()}
                          {warning ? (
                            <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-sm">
                              <TriangleAlert className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-neutral-900">{item.name}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                                {Number.isFinite(averageCost) ? `Costo $${formatMoney(averageCost)} / ${unitLabel}` : "Costo —"}
                              </p>
                            </div>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", badge.tone)}>
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
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
        placeholder={tab === "ingredients" ? "Buscar insumo..." : "Buscar receta..."}
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
              const unitLabel = formatIngredientUnit(item);
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
                    <p className="truncate text-sm font-black text-neutral-900">{item.name}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                      {out ? "Acción recomendada: cargar stock" : "Acción recomendada: revisar mínimo"} · Stock {formatMoney(parseNumber(item.currentStock))} {unitLabel}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", out ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700")}>
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
          mode="create"
          defaults={{ name: "" }}
          submitting={creatingIngredient}
          onCancel={() => setIngredientSheetOpen(false)}
          onSubmit={async (values) => {
            const loadingId = "inventory-ingredient-create-loading";
            try {
              setCreatingIngredient(true);
              toast.loading("Creando ingrediente...", { id: loadingId });
              await createIngredient({
                name: values.name,
                consumptionUnit: values.consumptionUnit,
                purchaseUnit: values.purchaseUnit,
                purchaseToConsumptionFactor: values.purchaseToConsumptionFactor,
                customUnitLabel: values.customUnitLabel,
                minStock: values.minStock,
              });
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
