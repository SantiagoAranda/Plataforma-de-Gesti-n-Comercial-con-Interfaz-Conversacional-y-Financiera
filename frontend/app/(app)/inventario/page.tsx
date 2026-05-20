"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Bell, BookOpen, ChevronDown, ChevronUp, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney } from "@/src/lib/formatters";

import AppHeader from "@/src/components/layout/AppHeader";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { InventoryChatActionBar } from "@/src/components/inventory/InventoryChatActionBar";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { MovementForm, type MovementAction } from "@/src/components/inventory/MovementForm";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";

import {
  createIngredient,
  getInventorySummary,
  getRecipe,
  replaceRecipe,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";

type UITab = "recipes" | "ingredients";

function isRecipeEditableInline(item: { inventoryMode?: string | null }) {
  return item.inventoryMode === "RECIPE_BASED";
}

function sameRecipe(a: RecipeLine[], b: RecipeLine[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const al = a[i];
    const bl = b[i];
    if (al?.ingredientId !== bl?.ingredientId) return false;
    if (Number(al?.quantityRequired ?? 0) !== Number(bl?.quantityRequired ?? 0)) return false;
    if (!!al?.isOptional !== !!bl?.isOptional) return false;
  }
  return true;
}

export default function InventarioPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipesByItemId, setRecipesByItemId] = useState<Record<string, RecipeLine[]>>({});

  const [tab, setTab] = useState<UITab>("recipes");
  const [searchQuery, setSearchQuery] = useState("");

  const [alertsOpen, setAlertsOpen] = useState(false);

  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeDrafts, setRecipeDrafts] = useState<Record<string, RecipeLine[]>>({});
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);

  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [prefillIngredientName, setPrefillIngredientName] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  const [movementSheetOpen, setMovementSheetOpen] = useState(false);
  const [movementIngredientId, setMovementIngredientId] = useState<string>("");
  const [movementInitialAction, setMovementInitialAction] = useState<MovementAction>("PURCHASE");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
      ]);

      setSummary(summaryData ?? []);
      setItems((itemsData ?? []).filter((i) => i.status === "ACTIVE"));

      const recipeItems = (itemsData ?? [])
        .filter((i) => i.status === "ACTIVE")
        .filter((i) => i.type === "PRODUCT" && (i.inventoryMode === "SIMPLE" || i.inventoryMode === "RECIPE_BASED"));

      const recipes = await Promise.all(
        recipeItems.map(async (it) => {
          try {
            const lines = (await getRecipe(it.id)) ?? [];
            return [it.id, lines] as const;
          } catch (e) {
            console.error("Failed to load recipe for", it.id, e);
            return [it.id, []] as const;
          }
        }),
      );

      setRecipesByItemId(Object.fromEntries(recipes));
    } catch (e) {
      console.error(e);
      setError(getErrorMessage(e, "No se pudo cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inventoryTotalValue = useMemo(() => {
    return summary.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
  }, [summary]);

  const alertGroups = useMemo(() => {
    const outOfStock: InventorySummaryIngredient[] = [];
    const lowStock: InventorySummaryIngredient[] = [];

    for (const it of summary) {
      const currentStock = parseNumber(it.currentStock);
      const minStock = parseNumber((it as any).minStock ?? 0);
      const isOut = it.outOfStock !== undefined ? it.outOfStock : Number.isFinite(currentStock) && currentStock <= 0;
      const isLow =
        it.lowStock !== undefined
          ? it.lowStock
          : Number.isFinite(minStock) &&
            minStock > 0 &&
            Number.isFinite(currentStock) &&
            currentStock > 0 &&
            currentStock <= minStock;

      if (isOut) outOfStock.push(it);
      else if (isLow) lowStock.push(it);
    }

    outOfStock.sort((a, b) => a.name.localeCompare(b.name));
    lowStock.sort((a, b) => a.name.localeCompare(b.name));

    return { outOfStock, lowStock, count: outOfStock.length + lowStock.length };
  }, [summary]);

  const recipeItems = useMemo(() => {
    return items
      .filter((i) => i.type === "PRODUCT")
      .filter((i) => i.inventoryMode === "SIMPLE" || i.inventoryMode === "RECIPE_BASED");
  }, [items]);

  const visibleIngredients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return summary;
    return summary.filter((i) => (i.name ?? "").toLowerCase().includes(q));
  }, [summary, searchQuery]);

  const visibleRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recipeItems;
    return recipeItems.filter((i) => (i.name ?? "").toLowerCase().includes(q));
  }, [recipeItems, searchQuery]);

  const recipeCost = useCallback(
    (itemId: string) => {
      const lines = recipesByItemId[itemId] ?? [];
      let invalid = false;
      const cost = lines.reduce((acc, l) => {
        const qty = Number(l.quantityRequired ?? 0);
        const ing = summary.find((s) => s.id === l.ingredientId) ?? null;
        const avg = parseNumber(String(ing?.averageCost ?? "0"));
        if (!l.ingredientId || !Number.isFinite(qty) || qty <= 0) invalid = true;
        if (!Number.isFinite(avg) || avg <= 0) invalid = true;
        return Number.isFinite(qty) && Number.isFinite(avg) ? acc + qty * avg : acc;
      }, 0);
      return invalid ? null : cost;
    },
    [recipesByItemId, summary],
  );

  const openMovementSheet = (action: MovementAction) => {
    setMovementInitialAction(action);
    setMovementSheetOpen(true);
  };

  const openCreateIngredientFromBar = useCallback(() => {
    const text = searchQuery.trim();
    if (!text) {
      toast.error("Escribí un ingrediente para crearlo o buscarlo");
      return;
    }
    setPrefillIngredientName(text);
    setIngredientSheetOpen(true);
  }, [searchQuery]);

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
          {/* Summary */}
          <section className="relative overflow-hidden rounded-2xl bg-[#0B1220] p-4 shadow-sm ring-1 ring-black/10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                  INVENTARIO TOTAL
                </p>
                <p className="mt-1 truncate text-2xl font-black text-white">
                  ${formatMoney(inventoryTotalValue)} COP
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-12 w-px bg-white/10" aria-hidden />
                <div className="space-y-1 pl-4">
                  <div className="flex items-baseline justify-between gap-6 text-xs font-bold text-white/70">
                    <span>Recetas</span>
                    <span className="font-black text-white">{formatMoney(recipeItems.length)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-6 text-xs font-bold text-white/70">
                    <span>Faltantes</span>
                    <span className="font-black text-rose-300">{formatMoney(alertGroups.outOfStock.length)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Switch */}
          <section className="rounded-2xl bg-neutral-100/80 p-1.5 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setTab("recipes")}
                className={cn(
                  "h-9 rounded-2xl text-xs font-black transition active:scale-[0.99]",
                  tab === "recipes"
                    ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5"
                    : "bg-transparent text-neutral-500",
                )}
              >
                Recetas
              </button>
              <button
                type="button"
                onClick={() => setTab("ingredients")}
                className={cn(
                  "h-9 rounded-2xl text-xs font-black transition active:scale-[0.99]",
                  tab === "ingredients"
                    ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5"
                    : "bg-transparent text-neutral-500",
                )}
              >
                Insumos
              </button>
            </div>
          </section>

          {/* Content */}
          {loading ? (
            <div className="rounded-2xl bg-white p-4 text-center text-sm font-medium text-neutral-400 shadow-sm ring-1 ring-black/5">
              Cargando...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
              {error}
            </div>
          ) : tab === "ingredients" ? (
            <section className="space-y-2">
              {visibleIngredients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm font-medium text-neutral-500 shadow-sm">
                  No hay insumos para mostrar.
                </div>
              ) : (
                visibleIngredients.map((it) => {
                  const currentStock = parseNumber(it.currentStock);
                  const minStock = parseNumber((it as any).minStock ?? 0);
                  const outOfStock = it.outOfStock !== undefined ? it.outOfStock : Number.isFinite(currentStock) && currentStock <= 0;
                  const lowStock =
                    it.lowStock !== undefined
                      ? it.lowStock
                      : Number.isFinite(minStock) &&
                        minStock > 0 &&
                        Number.isFinite(currentStock) &&
                        currentStock > 0 &&
                        currentStock <= minStock;

                  const warning = it.status === "ACTIVE" && (outOfStock || lowStock);
                  const badge = outOfStock
                    ? { label: "SIN STOCK", tone: "bg-rose-600 text-white" }
                    : lowStock
                      ? { label: "CRÍTICO", tone: "bg-rose-50 text-rose-700 ring-1 ring-rose-100" }
                      : { label: `${formatMoney(currentStock)} ${it.consumptionUnit}`.trim(), tone: "bg-neutral-100 text-neutral-700" };

                  const avatar = (it.name ?? "I").trim().slice(0, 1).toUpperCase();
                  const avgCost = parseNumber(it.averageCost);

                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => router.push(`/inventario/ingredientes/${it.id}`)}
                      className={cn(
                        "w-full rounded-2xl p-3 text-left shadow-sm transition active:scale-[0.99] ring-1",
                        warning ? "bg-rose-50/70 ring-rose-100" : "bg-white ring-black/5",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-sm font-black text-neutral-700 ring-1 ring-black/5">
                          {avatar}
                          {warning ? (
                            <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-sm">
                              <TriangleAlert className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-neutral-900">{it.name}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                                {Number.isFinite(avgCost) ? `Costo $${formatMoney(avgCost)} / ${it.consumptionUnit}` : "Costo —"}
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
                visibleRecipes.map((it) => {
                  const linesOriginal = recipesByItemId[it.id] ?? [];
                  const draft = recipeDrafts[it.id] ?? linesOriginal;
                  const expanded = expandedRecipeId === it.id;

                  const cost = recipeCost(it.id);
                  const price = typeof it.price === "number" ? it.price : null;
                  const profit = price !== null && cost !== null ? price - cost : null;

                  const dirty = recipeDrafts[it.id] ? !sameRecipe(draft, linesOriginal) : false;
                  const canInlineEdit = isRecipeEditableInline(it);

                  return (
                    <article
                      key={it.id}
                      className={cn(
                        "rounded-2xl bg-white shadow-sm ring-1 ring-black/5",
                        expanded ? "p-3" : "p-3",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedRecipeId((prev) => (prev === it.id ? null : it.id));
                          setRecipeDrafts((prev) => (prev[it.id] ? prev : { ...prev, [it.id]: linesOriginal }));
                        }}
                        className="w-full text-left"
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-neutral-700 ring-1 ring-black/5">
                            <BookOpen className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-neutral-900">{it.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                              <span className="text-neutral-500">
                                {price === null ? "Venta —" : `Venta $${formatMoney(price)}`}
                              </span>
                              <span className="text-rose-700">
                                {cost === null ? "Costo —" : `Costo $${formatMoney(cost)}`}
                              </span>
                              {profit !== null ? (
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", profit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
                                  {profit >= 0 ? `+ $${formatMoney(profit)}` : `- $${formatMoney(Math.abs(profit))}`}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-black/5">
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </button>

                      {expanded ? (
                        <div className="mt-3 space-y-2">
                          {draft.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-500">
                              Sin receta configurada.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {draft.map((line, idx) => {
                                const qty = Number(line.quantityRequired ?? 0);
                                const ing = summary.find((s) => s.id === line.ingredientId) ?? null;
                                const name = ing?.name ?? "Insumo";
                                const unit = ing?.consumptionUnit ?? "";
                                const avg = parseNumber(String(ing?.averageCost ?? "0"));

                                return (
                                  <div key={`${it.id}-${line.ingredientId}-${idx}`} className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-black/5">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-[13px] font-black text-neutral-900">{name}</p>
                                        <p className="mt-0.5 truncate text-[11px] font-medium text-neutral-500">
                                          {Number.isFinite(avg) ? `$${formatMoney(avg)} / ${unit}`.trim() : "Costo —"}
                                        </p>
                                      </div>

                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={!canInlineEdit}
                                          onClick={() => {
                                            if (!canInlineEdit) return;
                                            setRecipeDrafts((prev) => {
                                              const next = (prev[it.id] ?? draft).slice();
                                              const nextQty = Math.max(0, (Number(next[idx]?.quantityRequired ?? qty) || 0) - 1);
                                              next[idx] = { ...next[idx], quantityRequired: nextQty };
                                              return { ...prev, [it.id]: next };
                                            });
                                          }}
                                          className="grid h-8 w-8 place-items-center rounded-full bg-white text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-95 disabled:opacity-40"
                                          aria-label="Restar"
                                        >
                                          <Minus className="h-4 w-4" />
                                        </button>

                                        <div className="min-w-[76px] rounded-full bg-white px-3 py-2 text-center text-xs font-black text-neutral-900 shadow-sm ring-1 ring-black/5">
                                          {`${formatMoney(qty)} ${unit}`.trim()}
                                        </div>

                                        <button
                                          type="button"
                                          disabled={!canInlineEdit}
                                          onClick={() => {
                                            if (!canInlineEdit) return;
                                            setRecipeDrafts((prev) => {
                                              const next = (prev[it.id] ?? draft).slice();
                                              const nextQty = (Number(next[idx]?.quantityRequired ?? qty) || 0) + 1;
                                              next[idx] = { ...next[idx], quantityRequired: nextQty };
                                              return { ...prev, [it.id]: next };
                                            });
                                          }}
                                          className="grid h-8 w-8 place-items-center rounded-full bg-white text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-95 disabled:opacity-40"
                                          aria-label="Sumar"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </button>

                                        <button
                                          type="button"
                                          disabled={!canInlineEdit}
                                          onClick={() => {
                                            if (!canInlineEdit) return;
                                            setRecipeDrafts((prev) => {
                                              const next = (prev[it.id] ?? draft).slice();
                                              next.splice(idx, 1);
                                              return { ...prev, [it.id]: next };
                                            });
                                          }}
                                          className="grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-rose-700 transition active:scale-95 disabled:opacity-40"
                                          aria-label="Eliminar"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => router.push(`/inventario/recetas?itemId=${encodeURIComponent(it.id)}`)}
                              className="h-10 rounded-2xl bg-white text-xs font-black text-neutral-900 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                            >
                              Editar receta
                            </button>

                            {dirty && canInlineEdit ? (
                              <button
                                type="button"
                                disabled={savingRecipeId === it.id}
                                onClick={async () => {
                                  const loadingId = `recipe-inline-save-${it.id}`;
                                  try {
                                    setSavingRecipeId(it.id);
                                    toast.loading("Guardando receta...", { id: loadingId });

                                    const anyInvalid = draft.some(
                                      (l) =>
                                        !l.ingredientId ||
                                        !Number.isFinite(Number(l.quantityRequired)) ||
                                        Number(l.quantityRequired) <= 0,
                                    );
                                    const mandatory = draft.filter((l) => !l.isOptional);
                                    if (anyInvalid) {
                                      toast.error("Hay ingredientes con cantidad inválida o sin insumo", { id: loadingId });
                                      return;
                                    }
                                    if (mandatory.length < 1) {
                                      toast.error("RECIPE_BASED requiere al menos 1 ingrediente obligatorio", { id: loadingId });
                                      return;
                                    }
                                    const ids = draft.map((l) => l.ingredientId);
                                    if (new Set(ids).size !== ids.length) {
                                      toast.error("La receta contiene ingredientes duplicados", { id: loadingId });
                                      return;
                                    }

                                    await replaceRecipe(it.id, { lines: draft });
                                    toast.success("Receta guardada", { id: loadingId });
                                    setRecipeDrafts((prev) => ({ ...prev, [it.id]: draft }));
                                    await load();
                                  } catch (e) {
                                    console.error(e);
                                    toast.error(getErrorMessage(e, "No se pudo guardar la receta"), { id: loadingId });
                                  } finally {
                                    setSavingRecipeId(null);
                                  }
                                }}
                                className="h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
                              >
                                Guardar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => router.push("/inventario/kardex")}
                                className="h-10 rounded-2xl bg-neutral-100 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                              >
                                Kardex
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
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
        onCreateIngredient={openCreateIngredientFromBar}
        onRegisterPurchase={() => openMovementSheet("PURCHASE")}
        onPickAction={(action) => {
          if (action === "INGREDIENTES") setTab("ingredients");
          if (action === "RECETAS") setTab("recipes");
          if (action === "KARDEX") router.push("/inventario/kardex");
        }}
      />

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
          <div className="space-y-3">
            {alertGroups.outOfStock.length > 0 ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Faltantes</p>
                <div className="mt-3 space-y-2">
                  {alertGroups.outOfStock.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        router.push(`/inventario/ingredientes/${it.id}`);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-rose-50 px-3 py-3 text-left ring-1 ring-rose-100 transition active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-rose-900">{it.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-rose-700">
                          Stock: {formatMoney(parseNumber(it.currentStock))} {it.consumptionUnit}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        SIN STOCK
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {alertGroups.lowStock.length > 0 ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Mínimo alcanzado</p>
                <div className="mt-3 space-y-2">
                  {alertGroups.lowStock.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        router.push(`/inventario/ingredientes/${it.id}`);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-rose-50/60 px-3 py-3 text-left ring-1 ring-rose-100 transition active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-neutral-900">{it.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-neutral-600">
                          Stock: {formatMoney(parseNumber(it.currentStock))} {it.consumptionUnit}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                        CRÍTICO
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </ItemPanelLayout>

      <ItemPanelLayout
        open={ingredientSheetOpen}
        title="Nuevo ingrediente"
        subtitle="Crear desde el chat"
        onClose={() => setIngredientSheetOpen(false)}
      >
        <IngredientForm
          mode="create"
          defaults={{ name: prefillIngredientName }}
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

      <ItemPanelLayout
        open={movementSheetOpen}
        title={movementInitialAction === "PURCHASE" ? "Cargar stock" : "Registrar movimiento"}
        subtitle="Movimiento rápido"
        onClose={() => setMovementSheetOpen(false)}
      >
        {summary.length === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
            No hay ingredientes activos para registrar movimientos.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Ingrediente</p>
              <select
                value={movementIngredientId || summary[0]?.id || ""}
                onChange={(e) => setMovementIngredientId(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                {summary.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const selected =
                summary.find((s) => s.id === (movementIngredientId || summary[0]?.id)) ?? null;
              if (!selected) return null;
              return (
                <MovementForm
                  ingredient={selected}
                  initialAction={movementInitialAction}
                  onSuccess={async () => {
                    setMovementSheetOpen(false);
                    setSearchQuery("");
                    await load();
                  }}
                />
              );
            })()}
          </div>
        )}
      </ItemPanelLayout>
    </div>
  );
}

