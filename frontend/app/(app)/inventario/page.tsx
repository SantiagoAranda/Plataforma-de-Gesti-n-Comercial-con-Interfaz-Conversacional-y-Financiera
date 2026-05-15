"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ClipboardList,
  Download,
  Filter,
  PackageSearch,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney } from "@/src/lib/formatters";

import AppHeader from "@/src/components/layout/AppHeader";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { DateSeparator } from "@/src/components/shared/DateSeparator";

import {
  createIngredient,
  getInventorySummary,
  getRecipe,
  listKardex,
  type InventoryMovement,
  type InventoryMovementType,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";

import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { MovementForm, type MovementAction } from "@/src/components/inventory/MovementForm";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { InventorySummaryCards } from "@/src/components/inventory/InventorySummaryCards";
import { InventoryQuickActions } from "@/src/components/inventory/InventoryQuickActions";
import { InventoryRecipeCard } from "@/src/components/inventory/InventoryRecipeCard";
import type { ComposedProduct } from "@/src/components/inventory/types";
import { ProductInventoryFeedItem } from "@/src/components/inventory/ProductInventoryFeedItem";
import { KardexList } from "@/src/components/inventory/KardexList";

type InventoryScreen = "lists" | "home" | "kardex";
type InventoryListTab = "ingredients" | "products";

type InventoryKardexMovement = InventoryMovement & {
  itemName: string;
};

type Selection =
  | { kind: "none" }
  | { kind: "ingredient"; id: string }
  | { kind: "product"; id: string };

function isInventoryOutput(type: InventoryMovementType) {
  return type === "SALE" || type === "ADJUSTMENT_NEGATIVE" || type === "PURCHASE_RETURN";
}

function formatRelativeTime(dateISO: string | undefined | null) {
  if (!dateISO) return "—";
  const ms = new Date(dateISO).getTime();
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Recién";
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

function getInventorySearchPlaceholder(screen: InventoryScreen) {
  if (screen === "home") return "Buscar en inventario o escribir comando...";
  if (screen === "lists") return "Buscar insumo o producto...";
  if (screen === "kardex") return "Buscar movimiento...";
  return "Buscar...";
}

function impactTextFromRecipe(recipe: Array<{ name: string; qty: number; unit?: string }>) {
  const mandatory = recipe.slice(0, 2);
  if (!mandatory.length) return null;
  const parts = mandatory.map((l) => `-${l.qty}${l.unit ? l.unit : ""} ${l.name}`.trim());
  return recipe.length > 2 ? `${parts.join(", ")}…` : parts.join(", ");
}

function estimateRecipeCost(lines: Array<{ qty: number; avgCost: number }>) {
  const total = lines.reduce((acc, l) => acc + l.qty * l.avgCost, 0);
  return Number.isFinite(total) ? total : null;
}

function MobileMetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "sky" | "rose";
  icon: ReactNode;
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "sky"
        ? "bg-sky-50 text-sky-700"
        : "bg-rose-50 text-rose-700";

  return (
    <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className={cn("grid h-9 w-9 place-items-center rounded-full", toneClass)}>{icon}</div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-[15px] font-black text-neutral-900">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-neutral-400">{hint}</p>
    </div>
  );
}

function InventoryTopTabs({
  active,
  onChange,
}: {
  active: InventoryScreen;
  onChange: (screen: InventoryScreen) => void;
}) {
  const tabs: Array<{ key: InventoryScreen; label: string }> = [
    { key: "lists", label: "Listas" },
    { key: "home", label: "Home" },
    { key: "kardex", label: "Kardex" },
  ];

  return (
    <div className="rounded-[28px] bg-white p-1.5 shadow-sm ring-1 ring-black/5">
      <div className="grid grid-cols-3 gap-1.5">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                "h-10 rounded-[22px] text-xs font-black transition active:scale-[0.99]",
                isActive
                  ? "bg-emerald-500 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InventoryListTabs({
  active,
  onChange,
}: {
  active: InventoryListTab;
  onChange: (tab: InventoryListTab) => void;
}) {
  return (
    <div className="rounded-3xl border border-neutral-200/70 bg-white/70 p-2 shadow-sm ring-1 ring-black/5">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("ingredients")}
          className={
            active === "ingredients"
              ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
              : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
          }
        >
          Insumos
        </button>
        <button
          type="button"
          onClick={() => onChange("products")}
          className={
            active === "products"
              ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
              : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
          }
        >
          Productos
        </button>
      </div>
    </div>
  );
}

function DesktopListsPanel({
  activeTab,
  onChangeTab,
  query,
  onChangeQuery,
  ingredients,
  products,
  selection,
  onSelectIngredient,
  onSelectProduct,
  lastMovementByIngredientId,
}: {
  activeTab: InventoryListTab;
  onChangeTab: (tab: InventoryListTab) => void;
  query: string;
  onChangeQuery: (v: string) => void;
  ingredients: InventorySummaryIngredient[];
  products: Array<{ product: ComposedProduct; imageUrl?: string | null }>;
  selection: Selection;
  onSelectIngredient: (id: string) => void;
  onSelectProduct: (id: string) => void;
  lastMovementByIngredientId: Map<string, InventoryKardexMovement>;
}) {
  const q = query.trim().toLowerCase();
  const filteredIngredients = useMemo(() => {
    const sorted = [...ingredients].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (!q) return sorted;
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, q]);

  const filteredProducts = useMemo(() => {
    const visible = products.filter(
      (p) => p.product.inventoryMode === "SIMPLE" || p.product.inventoryMode === "RECIPE_BASED",
    );
    if (!q) return visible;
    return visible.filter((p) => p.product.itemName.toLowerCase().includes(q));
  }, [products, q]);

  return (
    <section className="min-w-0 h-full overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-neutral-900">Inventario</p>
            <p className="truncate text-[12px] font-medium text-neutral-500">Listas</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <InventoryListTabs active={activeTab} onChange={onChangeTab} />

        <div className="flex items-center gap-2">
          <div className="flex h-11 flex-1 items-center rounded-2xl border border-neutral-100 bg-white px-4 shadow-sm ring-1 ring-black/5">
            <PackageSearch className="h-4 w-4 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => onChangeQuery(e.target.value)}
              placeholder={activeTab === "ingredients" ? "Buscar insumo..." : "Buscar producto..."}
              className="ml-2 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-neutral-400"
            />
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full bg-neutral-100 text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-95"
            aria-label="Filtro"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 pb-36">
        {activeTab === "ingredients" ? (
          <div className="space-y-3">
            {filteredIngredients.map((it) => {
              const currentStock = parseNumber(it.currentStock);
              const stockValue = parseNumber(it.stockValue);
              const minStock = parseNumber((it as any).minStock ?? 0);
              const lowStock =
                it.lowStock !== undefined
                  ? it.lowStock
                  : Number.isFinite(minStock) &&
                    minStock > 0 &&
                    Number.isFinite(currentStock) &&
                    currentStock > 0 &&
                    currentStock <= minStock;
              const outOfStock =
                it.outOfStock !== undefined
                  ? it.outOfStock
                  : Number.isFinite(currentStock) && currentStock <= 0;
              const badge = outOfStock
                ? { label: "Sin stock", tone: "bg-rose-50 text-rose-700" }
                : lowStock
                  ? { label: "Stock bajo", tone: "bg-amber-50 text-amber-800" }
                  : { label: "OK", tone: "bg-emerald-50 text-emerald-800" };
              const avatar = (it.name ?? "I").trim().slice(0, 1).toUpperCase();
              const selected = selection.kind === "ingredient" && selection.id === it.id;
              const last = lastMovementByIngredientId.get(it.id) ?? null;

              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectIngredient(it.id)}
                  className={cn(
                    "w-full rounded-2xl bg-white p-4 text-left shadow-sm transition active:scale-[0.99] border",
                    selected
                      ? "border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-200"
                      : "border-neutral-200 hover:bg-white",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black text-neutral-700">
                      {avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-900">{it.name}</p>
                          <p className="mt-1 text-[11px] font-medium text-neutral-400">
                            {formatMoney(currentStock)} {it.consumptionUnit} disponibles
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-neutral-400">
                            &Uacute;lt. mov: {last ? new Date(last.occurredAt).toLocaleString("es-AR") : "—"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                              badge.tone,
                            )}
                          >
                            {badge.label}
                          </span>
                          <p className="mt-2 text-xs font-black text-neutral-900">
                            ${formatMoney(stockValue)} COP
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredIngredients.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
                No hay insumos para mostrar.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map(({ product, imageUrl }) => {
              const selected = selection.kind === "product" && selection.id === product.itemId;
              return (
                <div
                  key={product.itemId}
                  className={cn(
                    "rounded-2xl border bg-white p-2 shadow-sm ring-1 ring-black/5",
                    selected ? "border-emerald-200 bg-emerald-50/40" : "border-neutral-200",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product.itemId)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-neutral-50 active:scale-[0.99]"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl}
                          alt={product.itemName}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-full w-full bg-neutral-100" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-neutral-900">{product.itemName}</p>
                      <p className="mt-1 text-[11px] font-medium text-neutral-400">
                        {product.inventoryMode === "RECIPE_BASED"
                          ? "Receta basada en ingredientes"
                          : "Stock propio"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                      Activa
                    </span>
                  </button>
                </div>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
                No hay productos con inventario para mostrar.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DesktopHomePanel({
  loading,
  error,
  summary,
  recipeCards,
  onQuickLoadStock,
  onQuickAdjustStock,
  onQuickNewRecipe,
  onQuickViewKardex,
}: {
  loading: boolean;
  error: string | null;
  summary: InventorySummaryIngredient[];
  recipeCards: Array<{
    id: string;
    name: string;
    price?: number | null;
    estimatedCost?: number | null;
    ingredientsCount?: number | null;
    impactText?: string | null;
    imageUrl?: string | null;
    onEditRecipe?: () => void;
    onViewKardex?: () => void;
  }>;
  onQuickLoadStock: () => void;
  onQuickAdjustStock: () => void;
  onQuickNewRecipe: () => void;
  onQuickViewKardex: () => void;
}) {
  return (
    <section className="min-w-0 h-full overflow-y-auto custom-scrollbar rounded-3xl border border-black/5 bg-white/40 p-4 pb-36 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-neutral-500">Resumen del inventario</p>
          <h2 className="truncate text-xl font-black text-neutral-900">Inventario</h2>
        </div>
        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
          Saldo
        </span>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
            Cargando resumen...
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-rose-700 shadow-sm ring-1 ring-black/5">
            {error}
          </div>
        ) : (
          <InventorySummaryCards items={summary} />
        )}
      </div>

      <div className="mt-4">
        <InventoryQuickActions
          onLoadStock={onQuickLoadStock}
          onAdjustStock={onQuickAdjustStock}
          onNewRecipe={onQuickNewRecipe}
          onViewKardex={onQuickViewKardex}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-black text-neutral-900">Recetas / Productos</h3>
        <button
          type="button"
          className="text-[10px] font-black uppercase tracking-widest text-emerald-700"
        >
          Ver todos
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {recipeCards.slice(0, 2).map((card) => (
          <InventoryRecipeCard
            key={card.id}
            name={card.name}
            price={card.price}
            estimatedCost={card.estimatedCost}
            ingredientsCount={card.ingredientsCount}
            impactText={card.impactText}
            imageUrl={card.imageUrl}
            onEditRecipe={card.onEditRecipe}
            onViewKardex={card.onViewKardex}
          />
        ))}

        {recipeCards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 px-6 py-10 text-center text-neutral-400">
            Todav&iacute;a no hay productos con receta configurada.
          </div>
        )}
      </div>
    </section>
  );
}

function DesktopDetailPanel({
  selection,
  summary,
  products,
  itemsById,
  kardexMovements,
  onClearSelection,
  onOpenIngredient,
  onOpenRecipes,
  onOpenKardex,
}: {
  selection: Selection;
  summary: InventorySummaryIngredient[];
  products: ComposedProduct[];
  itemsById: Map<string, Item>;
  kardexMovements: InventoryKardexMovement[];
  onClearSelection: () => void;
  onOpenIngredient: (id: string) => void;
  onOpenRecipes: () => void;
  onOpenKardex: (ingredientId?: string) => void;
}) {
  if (selection.kind === "none") {
    return (
      <section className="min-w-0 h-full overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-black/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-neutral-900">Detalle</p>
              <p className="truncate text-[12px] font-medium text-neutral-500">
                Seleccion&aacute; un insumo o producto
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-700">
              <PackageSearch className="h-5 w-5" />
            </span>
          </div>
        </div>
        <div className="p-4 text-sm text-neutral-500">
          Us&aacute; el panel de listas para elegir un elemento y ver su informaci&oacute;n contextual.
        </div>
      </section>
    );
  }

  if (selection.kind === "ingredient") {
    const ingredient = summary.find((s) => s.id === selection.id) ?? null;
    const recent = kardexMovements
      .filter((m) => m.ingredientId === selection.id)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, 4);

    return (
      <section className="min-w-0 h-full overflow-y-auto custom-scrollbar rounded-3xl border border-black/5 bg-white p-4 pb-36 shadow-sm ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Insumo</p>
            <h2 className="mt-1 truncate text-lg font-black text-neutral-900">
              {ingredient?.name ?? "Ingrediente"}
            </h2>
            <p className="mt-1 text-xs font-medium text-neutral-500">
              {ingredient ? `${ingredient.consumptionUnit} / ${ingredient.purchaseUnit}` : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {ingredient ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Stock</p>
                <p className="mt-1 text-lg font-black text-neutral-900">
                  {formatMoney(parseNumber(ingredient.currentStock))} {ingredient.consumptionUnit}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Costo prom.</p>
                <p className="mt-1 text-lg font-black text-neutral-900">
                  ${formatMoney(parseNumber(ingredient.averageCost))} COP
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor total</p>
              <p className="mt-1 text-lg font-black text-neutral-900">
                ${formatMoney(parseNumber(ingredient.stockValue))} COP
              </p>
              <p className="mt-1 text-[11px] font-medium text-neutral-400">
                &Uacute;ltima actualizaci&oacute;n: {formatRelativeTime(ingredient.updatedAt)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenIngredient(selection.id)}
                className="h-10 rounded-2xl bg-white px-4 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
              >
                Abrir detalle
              </button>
              <button
                type="button"
                onClick={() => onOpenKardex(selection.id)}
                className="h-10 rounded-2xl bg-emerald-500 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
              >
                Ver kardex completo
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h3 className="text-sm font-black text-neutral-900">Movimientos recientes</h3>
              <button
                type="button"
                onClick={() => onOpenKardex(selection.id)}
                className="text-[10px] font-black uppercase tracking-widest text-emerald-700"
              >
                Ver kardex &rarr;
              </button>
            </div>

            <div className="mt-3">
              <KardexList movements={recent} />
              {recent.length === 0 && (
                <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-8 text-center text-sm text-neutral-400">
                  No hay movimientos recientes.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
            No se encontr&oacute; el insumo seleccionado.
          </div>
        )}
      </section>
    );
  }

  const product = products.find((p) => p.itemId === selection.id) ?? null;
  const item = itemsById.get(selection.id) ?? null;
  const img = (item?.images ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.url ?? null;

  const impactedIngredientIds = new Set((product?.ingredients ?? []).map((i) => i.ingredientId));
  const recent = kardexMovements
    .filter((m) => impactedIngredientIds.has(m.ingredientId))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 6);

  return (
    <section className="min-w-0 h-full overflow-y-auto custom-scrollbar rounded-3xl border border-black/5 bg-white p-4 pb-36 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Producto</p>
          <h2 className="mt-1 truncate text-lg font-black text-neutral-900">{product?.itemName ?? "Producto"}</h2>
          <p className="mt-1 text-xs font-medium text-neutral-500">
            {product?.inventoryMode === "RECIPE_BASED" ? "Receta basada en ingredientes" : "Stock propio"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 active:scale-95"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={product?.itemName ?? "Producto"} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-neutral-100" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
              Activa
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-700">
              Producto
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-neutral-500">
            {product?.inventoryMode === "RECIPE_BASED"
              ? "Resumen de receta por unidad"
              : "Resumen de stock por unidad"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-neutral-900">Resumen de la receta (por unidad)</h3>
          <button
            type="button"
            onClick={onOpenRecipes}
            className="text-[10px] font-black uppercase tracking-widest text-emerald-700"
          >
            Editar &rarr;
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {(product?.ingredients ?? []).map((line) => (
            <div key={line.ingredientId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-neutral-900">{line.name}</p>
                <p className="mt-0.5 text-[11px] font-medium text-neutral-400">
                  {line.quantityRequired} {line.consumptionUnit ?? ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                  line.isOptional ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-800",
                )}
              >
                {line.isOptional ? "Opcional" : "Obligatorio"}
              </span>
            </div>
          ))}

          {(product?.ingredients ?? []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-8 text-center text-sm text-neutral-400">
              Sin receta configurada.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="text-sm font-black text-neutral-900">Informaci&oacute;n del producto</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Precio</p>
            <p className="mt-1 text-sm font-black text-neutral-900">
              ${formatMoney(item?.price ?? product?.price ?? 0)} COP
            </p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Ingredientes</p>
            <p className="mt-1 text-sm font-black text-neutral-900">{(product?.ingredients ?? []).length}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-black text-neutral-900">Movimientos recientes</h3>
        <button
          type="button"
          onClick={() => onOpenKardex()}
          className="text-[10px] font-black uppercase tracking-widest text-emerald-700"
        >
          Ver kardex completo &rarr;
        </button>
      </div>
      <div className="mt-3">
        <KardexList movements={recent} />
        {recent.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-8 text-center text-sm text-neutral-400">
            No hay movimientos recientes para los insumos de esta receta.
          </div>
        )}
      </div>
    </section>
  );
}

export default function InventarioPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [products, setProducts] = useState<ComposedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [itemsById, setItemsById] = useState<Map<string, Item>>(new Map());

  const [kardexLoading, setKardexLoading] = useState(false);
  const [kardexError, setKardexError] = useState<string | null>(null);
  const [kardexMovements, setKardexMovements] = useState<InventoryKardexMovement[]>([]);

  const [activeScreen, setActiveScreen] = useState<InventoryScreen>("home");
  const [activeListTab, setActiveListTab] = useState<InventoryListTab>("ingredients");
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileKardexRange, setMobileKardexRange] = useState<"today" | "yesterday" | "week" | "custom">("today");

  const [searchQuery, setSearchQuery] = useState("");
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [prefillIngredientName, setPrefillIngredientName] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  const [movementSheetOpen, setMovementSheetOpen] = useState(false);
  const [movementIngredientId, setMovementIngredientId] = useState<string>("");
  const [movementInitialAction, setMovementInitialAction] = useState<MovementAction>("PURCHASE");

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const compute = () => setIsDesktop(window.innerWidth >= 1024);
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
      ]);

      setSummary(summaryData ?? []);

      const allActiveItems = (itemsData ?? []).filter((i) => i.status === "ACTIVE");
      setItemsById(new Map(allActiveItems.map((i) => [i.id, i])));

      const productsWithRecipes = await Promise.all(
        allActiveItems.map(async (item) => {
          const inventoryMode = item.inventoryMode ?? "NONE";
          const shouldLoadRecipe =
            item.type === "PRODUCT" && (inventoryMode === "SIMPLE" || inventoryMode === "RECIPE_BASED");

          let recipeLines: RecipeLine[] = [];
          if (shouldLoadRecipe) {
            try {
              recipeLines = (await getRecipe(item.id)) ?? [];
            } catch (e) {
              console.error("Failed to load recipe for", item.id, e);
            }
          }

          const ingredients = recipeLines.map((line) => {
            const summaryIng = summaryData?.find((s) => s.id === line.ingredientId);
            return {
              ingredientId: line.ingredientId,
              name: summaryIng?.name ?? "Desconocido",
              quantityRequired: line.quantityRequired,
              consumptionUnit: summaryIng?.consumptionUnit,
              isOptional: !!line.isOptional,
              currentStock: summaryIng?.currentStock,
              averageCost: summaryIng?.averageCost,
            };
          });

          return {
            itemId: item.id,
            itemName: item.name,
            itemType: item.type,
            inventoryMode,
            price: item.price,
            stock: undefined,
            value: undefined,
            ingredients,
          } as ComposedProduct;
        }),
      );

      setProducts(productsWithRecipes);
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "No se pudo cargar el inventario");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKardexAll = useCallback(async () => {
    try {
      setKardexLoading(true);
      setKardexError(null);

      const ingredientIds = summary.map((s) => s.id);
      if (ingredientIds.length === 0) {
        setKardexMovements([]);
        return;
      }

      const byId = new Map(summary.map((s) => [s.id, s.name]));
      const perIngredient = await Promise.all(
        ingredientIds.map(async (ingredientId) => {
          try {
            const movements = (await listKardex(ingredientId)) ?? [];
            const name = byId.get(ingredientId) ?? "Insumo";
            return movements.map((m) => ({ ...m, itemName: name }));
          } catch (e) {
            console.error("Failed to load kardex for", ingredientId, e);
            return [] as InventoryKardexMovement[];
          }
        }),
      );

      setKardexMovements(perIngredient.flat());
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "No se pudo cargar el kardex");
      setKardexError(msg);
      setKardexMovements([]);
    } finally {
      setKardexLoading(false);
    }
  }, [summary]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (summary.length === 0) return;
    if (isDesktop || activeScreen === "kardex") {
      void loadKardexAll();
    }
  }, [summary.length, isDesktop, activeScreen, loadKardexAll]);

  const lastMovementByIngredientId = useMemo(() => {
    const map = new Map<string, InventoryKardexMovement>();
    for (const m of kardexMovements) {
      const current = map.get(m.ingredientId);
      if (!current || current.occurredAt < m.occurredAt) map.set(m.ingredientId, m);
    }
    return map;
  }, [kardexMovements]);

  const movementTitle: Record<MovementAction, string> = {
    INITIAL: "Inventario inicial",
    PURCHASE: "Registrar compra",
    PURCHASE_RETURN: "Devolución de compra",
    ADJUSTMENT_POSITIVE: "Ajuste positivo",
    ADJUSTMENT_NEGATIVE: "Ajuste negativo",
  };

  const openMovementSheet = useCallback(
    (action: MovementAction) => {
      setMovementInitialAction(action);
      setMovementSheetOpen(true);
      setMovementIngredientId((prev) => prev || summary[0]?.id || "");
    },
    [summary],
  );

  const handlePickAction = (action: InventoryChatMenuAction) => {
    if (action === "INGREDIENTES") {
      router.push("/inventario/ingredientes");
      return;
    }
    if (action === "KARDEX") {
      router.push("/inventario/kardex");
      return;
    }
    if (action === "RECETAS") {
      router.push("/inventario/recetas");
      return;
    }
  };

  const handleCreateIngredient = useCallback(() => {
    const text = searchQuery.trim();
    setPrefillIngredientName(text);
    setIngredientSheetOpen(true);
  }, [searchQuery]);

  // Mobile carousel behavior
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const screenToIndex: Record<InventoryScreen, number> = { lists: 0, home: 1, kardex: 2 };
  const indexToScreen: InventoryScreen[] = ["lists", "home", "kardex"];
  const rafRef = useRef<number | null>(null);

  const scrollToScreen = useCallback(
    (screen: InventoryScreen, behavior: ScrollBehavior = "smooth") => {
      const el = swipeRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      el.scrollTo({ left: screenToIndex[screen] * w, behavior });
    },
    [],
  );

  const setScreen = useCallback(
    (screen: InventoryScreen) => {
      setActiveScreen(screen);
      scrollToScreen(screen);
    },
    [scrollToScreen],
  );

  useEffect(() => {
    scrollToScreen(activeScreen, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recipeCards = useMemo(() => {
    const recipeProducts = products
      .filter((p) => p.itemType === "PRODUCT")
      .filter((p) => p.inventoryMode === "SIMPLE" || p.inventoryMode === "RECIPE_BASED");

    const cards = recipeProducts.map((p) => {
      const item = itemsById.get(p.itemId) ?? null;
      const img =
        (item?.images ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.url ?? null;

      const mandatory = (p.ingredients ?? []).filter((l: any) => !l.isOptional);
      const impact = impactTextFromRecipe(
        mandatory.map((l: any) => ({ name: l.name, qty: Number(l.quantityRequired ?? 0), unit: l.consumptionUnit })),
      );

      const cost = estimateRecipeCost(
        (p.ingredients ?? [])
          .filter((l: any) => !l.isOptional)
          .map((l: any) => ({ qty: Number(l.quantityRequired ?? 0), avgCost: parseNumber(l.averageCost ?? 0) }))
          .filter((l: any) => Number.isFinite(l.qty) && Number.isFinite(l.avgCost)),
      );

      return {
        id: p.itemId,
        name: p.itemName,
        price: p.price ?? item?.price ?? null,
        estimatedCost: cost,
        ingredientsCount: (p.ingredients ?? []).length,
        impactText: impact,
        imageUrl: img,
        onEditRecipe: () => router.push(`/inventario/recetas?itemId=${encodeURIComponent(p.itemId)}`),
        onViewKardex: () => router.push(`/inventario/kardex`),
      };
    });

    return cards;
  }, [products, itemsById, router]);

  const formatCompact = (n: number) => {
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) >= 1000) {
      const k = Math.round(n / 1000);
      return `${k}k`;
    }
    return formatMoney(n);
  };

  const mobileLists = (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
      <InventoryListTabs active={activeListTab} onChange={setActiveListTab} />

      <div className="flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center rounded-2xl border border-neutral-100 bg-white px-4 shadow-sm ring-1 ring-black/5">
          <PackageSearch className="h-4 w-4 text-neutral-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeListTab === "ingredients" ? "Buscar insumo..." : "Buscar producto..."}
            className="ml-2 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-neutral-400"
          />
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full bg-neutral-100 text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-95"
          aria-label="Filtro"
        >
          <Filter className="h-4 w-4" />
        </button>
      </div>

      {activeListTab === "ingredients" ? (
        <div className="space-y-3">
          {summary
            .filter(
              (i) =>
                !searchQuery.trim() ||
                i.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
            )
            .map((it) => {
              const currentStock = parseNumber(it.currentStock);
              const stockValue = parseNumber(it.stockValue);
              const minStock = parseNumber((it as any).minStock ?? 0);
              const lowStock =
                it.lowStock !== undefined
                  ? it.lowStock
                  : Number.isFinite(minStock) &&
                    minStock > 0 &&
                    Number.isFinite(currentStock) &&
                    currentStock > 0 &&
                    currentStock <= minStock;
              const outOfStock =
                it.outOfStock !== undefined
                  ? it.outOfStock
                  : Number.isFinite(currentStock) && currentStock <= 0;
              const badge = outOfStock
                ? { label: "Sin stock", tone: "bg-rose-50 text-rose-700" }
                : lowStock
                  ? { label: "Stock bajo", tone: "bg-amber-50 text-amber-800" }
                  : { label: "OK", tone: "bg-emerald-50 text-emerald-800" };
              const avatar = (it.name ?? "I").trim().slice(0, 1).toUpperCase();
              const last = lastMovementByIngredientId.get(it.id) ?? null;

              return (
                <article
                  key={it.id}
                  className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelection({ kind: "ingredient", id: it.id });
                      setMobileDetailOpen(true);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black text-neutral-700">
                        {avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 line-clamp-2 text-sm font-black text-neutral-950">
                            {it.name}
                          </h3>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                              badge.tone,
                            )}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          {formatMoney(currentStock)} {it.consumptionUnit} disponibles
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-neutral-400">
                          &Uacute;lt. mov.:{" "}
                          {last
                            ? new Date(last.occurredAt).toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Stock</p>
                        <p className="mt-1 text-sm font-black text-neutral-900">{formatMoney(currentStock)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor</p>
                        <p className="mt-1 text-sm font-black text-neutral-900">
                          ${formatMoney(stockValue)} COP
                        </p>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}

          {!loading && summary.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-black text-neutral-900">Sin insumos</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-400">
                Us&aacute; el + para crear el primer insumo.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products
            .filter((p) => p.inventoryMode === "SIMPLE" || p.inventoryMode === "RECIPE_BASED")
            .filter((p) => !searchQuery.trim() || p.itemName.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            .map((p) => (
              <ProductInventoryFeedItem
                key={p.itemId}
                product={p}
                onClick={() => {
                  setSelection({ kind: "product", id: p.itemId });
                  setMobileDetailOpen(true);
                }}
              />
            ))}
        </div>
      )}
    </div>
  );

  const mobileHome = (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
      <div className="grid grid-cols-3 gap-2">
        {(() => {
          const totalValue = summary.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
          const totalStock = summary.reduce((acc, it) => acc + parseNumber(it.currentStock), 0);
          const outOfStockCount = summary.filter((it) =>
            it.outOfStock !== undefined ? it.outOfStock : parseNumber(it.currentStock) <= 0,
          ).length;
          const lowStockCount = summary.filter((it) => {
            if (it.lowStock !== undefined) return it.lowStock;
            const minStock = parseNumber((it as any).minStock ?? 0);
            const currentStock = parseNumber(it.currentStock);
            return Number.isFinite(minStock) && minStock > 0 && currentStock > 0 && currentStock <= minStock;
          }).length;
          const alertCount = outOfStockCount + lowStockCount;

          return (
            <>
              <MobileMetricCard
                label="Valor"
                value={`$${formatCompact(totalValue)}`}
                hint="Costo total"
                tone="emerald"
                icon={<PackageSearch className="h-4 w-4" />}
              />
              <MobileMetricCard
                label="Stock"
                value={formatMoney(totalStock)}
                hint="Unidades"
                tone="sky"
                icon={<ClipboardList className="h-4 w-4" />}
              />
              <MobileMetricCard
                label="Alertas"
                value={String(alertCount)}
                hint="Críticas"
                tone="rose"
                icon={<Filter className="h-4 w-4" />}
              />
            </>
          );
        })()}
      </div>
      <InventoryQuickActions
        onLoadStock={() => openMovementSheet("PURCHASE")}
        onAdjustStock={() => openMovementSheet("ADJUSTMENT_POSITIVE")}
        onNewRecipe={() => router.push("/inventario/recetas")}
        onViewKardex={() => router.push("/inventario/kardex")}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-neutral-900">Recetas / Productos</h3>
        <button
          type="button"
          onClick={() => router.push("/inventario/recetas")}
          className="text-[10px] font-black uppercase tracking-widest text-emerald-700"
        >
          Ver todos
        </button>
      </div>

      <div className="space-y-3">
        {recipeCards.slice(0, 2).map((c) => (
          <InventoryRecipeCard
            key={c.id}
            name={c.name}
            price={c.price}
            estimatedCost={c.estimatedCost}
            ingredientsCount={c.ingredientsCount}
            impactText={c.impactText}
            imageUrl={c.imageUrl}
            onEditRecipe={c.onEditRecipe}
            onViewKardex={c.onViewKardex}
          />
        ))}
        {recipeCards.length === 0 && (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
            <p className="text-sm font-black text-neutral-900">Todav&iacute;a no hay recetas</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-400">
              Us&aacute; el bot&oacute;n + para crear la primera receta o asociar insumos a un producto.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const mobileKardex = (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Kardex &ndash; Inventario
          </p>
          <p className="mt-1 text-sm font-bold text-neutral-900">Movimientos</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-2xl bg-white px-4 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
        >
          <span className="inline-flex items-center gap-2">
            <Download className="h-4 w-4" /> Descargar
          </span>
        </button>
      </div>

      {kardexLoading ? (
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
          Cargando movimientos...
        </div>
      ) : kardexError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700 shadow-sm">
          {kardexError}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[28px] bg-white p-1.5 shadow-sm ring-1 ring-black/5">
            <div className="flex gap-1.5 overflow-x-auto">
              {[
                { key: "today", label: "Hoy" },
                { key: "yesterday", label: "Ayer" },
                { key: "week", label: "Esta semana" },
                { key: "custom", label: "Personalizado" },
              ].map((opt) => {
                const active = mobileKardexRange === (opt.key as any);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMobileKardexRange(opt.key as any)}
                    className={cn(
                      "h-10 shrink-0 rounded-[22px] px-4 text-xs font-black transition active:scale-[0.99]",
                      active ? "bg-emerald-500 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfYesterday = startOfToday - 86400000;
            const startOfWeek = startOfToday - 86400000 * 6;

            const filtered = kardexMovements
              .slice()
              .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
              .filter((m) => {
                const t = new Date(m.occurredAt).getTime();
                if (!Number.isFinite(t)) return true;
                if (mobileKardexRange === "today") return t >= startOfToday;
                if (mobileKardexRange === "yesterday") return t >= startOfYesterday && t < startOfToday;
                if (mobileKardexRange === "week") return t >= startOfWeek;
                return true;
              })
              .slice(0, 12);

            const stocks = filtered
              .slice()
              .reverse()
              .map((m) => parseNumber(m.stockAfter))
              .filter((n) => Number.isFinite(n));

            const chartPoints = stocks.length >= 2 ? stocks.slice(-7) : [120, 126, 118, 135, 128, 142, 136];
            const min = Math.min(...chartPoints);
            const max = Math.max(...chartPoints);
            const range = Math.max(1, max - min);

            const svgPoints = chartPoints
              .map((v, idx) => {
                const x = (idx / Math.max(1, chartPoints.length - 1)) * 260;
                const y = 60 - ((v - min) / range) * 48;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");

            const totalValue = summary.reduce((acc, it) => acc + parseNumber(it.stockValue), 0);
            const totalStock = summary.reduce((acc, it) => acc + parseNumber(it.currentStock), 0);
            const avgCost = summary.length
              ? summary.reduce((acc, it) => acc + parseNumber(it.averageCost), 0) / Math.max(1, summary.length)
              : 0;

            return (
              <>
                <DateSeparator dateISO={new Date().toISOString().slice(0, 10)} labelOverride="HOY" />

                <div className="space-y-3">
                  {filtered.map((m) => {
                    const out = isInventoryOutput(m.type);
                    const badgeTone = out ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800";
                    const surface = out ? "bg-rose-50/50" : "bg-emerald-50/50";
                    const Icon = out ? TrendingDown : TrendingUp;
                    const qty = parseNumber(m.quantity);
                    const value = parseNumber(m.totalValue);
                    const stockAfter = parseNumber(m.stockAfter);

                    return (
                      <article
                        key={m.id}
                        className={cn("rounded-3xl p-4 shadow-sm ring-1 ring-black/5", surface)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/80 ring-1 ring-black/5")}>
                              <Icon className={cn("h-5 w-5", out ? "text-rose-700" : "text-emerald-700")} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-neutral-950">{m.itemName}</p>
                              <p className="mt-0.5 text-[11px] font-medium leading-snug text-neutral-600">
                                {m.detail ?? "Movimiento de inventario"}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right space-y-1">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", badgeTone)}>
                              {out ? "SALIDA" : "ENTRADA"}
                            </span>
                            <span className="block text-[10px] font-black uppercase tracking-widest text-neutral-400">
                              {new Date(m.occurredAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Impacto</p>
                            <p className={cn("mt-1 text-sm font-black", out ? "text-rose-700" : "text-emerald-700")}>
                              {out ? "-" : "+"}
                              {formatMoney(qty)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Saldo</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{formatMoney(stockAfter)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">${formatMoney(value)} COP</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
                      No hay movimientos para este rango.
                    </div>
                  )}
                </div>

                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Evoluci&oacute;n del stock
                      </p>
                      <p className="mt-1 text-sm font-black text-neutral-900">Ultimos 7 puntos</p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-700">
                      Vista previa
                    </span>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-2xl bg-neutral-50 p-3 ring-1 ring-black/5">
                    <svg viewBox="0 0 260 60" className="h-[64px] w-full">
                      <polyline
                        points={svgPoints}
                        fill="none"
                        stroke="rgb(16,185,129)"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Stock</p>
                    <p className="mt-1 text-sm font-black text-neutral-900">{formatMoney(totalStock)}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-400">Actual</p>
                  </div>
                  <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Costo</p>
                    <p className="mt-1 text-sm font-black text-neutral-900">${formatMoney(avgCost)}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-400">Prom.</p>
                  </div>
                  <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor</p>
                    <p className="mt-1 text-sm font-black text-neutral-900">${formatCompact(totalValue)}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-400">Total</p>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Inventario" showBack hrefBack="/home" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Desktop panels */}
        <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-3 lg:p-3 xl:grid-cols-[320px_minmax(420px,1fr)_420px] xl:gap-4 xl:p-4">
          <DesktopListsPanel
            activeTab={activeListTab}
            onChangeTab={setActiveListTab}
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            ingredients={summary}
            products={products.map((p) => {
              const item = itemsById.get(p.itemId) ?? null;
              const img =
                (item?.images ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.url ?? null;
              return { product: p, imageUrl: img };
            })}
            selection={selection}
            onSelectIngredient={(id) => setSelection({ kind: "ingredient", id })}
            onSelectProduct={(id) => setSelection({ kind: "product", id })}
            lastMovementByIngredientId={lastMovementByIngredientId}
          />

          <DesktopHomePanel
            loading={loading}
            error={error}
            summary={summary}
            recipeCards={recipeCards}
            onQuickLoadStock={() => openMovementSheet("PURCHASE")}
            onQuickAdjustStock={() => openMovementSheet("ADJUSTMENT_POSITIVE")}
            onQuickNewRecipe={() => router.push("/inventario/recetas")}
            onQuickViewKardex={() => router.push("/inventario/kardex")}
          />

          <div className="hidden min-w-0 xl:block">
            <DesktopDetailPanel
              selection={selection}
              summary={summary}
              products={products}
              itemsById={itemsById}
              kardexMovements={kardexMovements}
              onClearSelection={() => setSelection({ kind: "none" })}
              onOpenIngredient={(id) => router.push(`/inventario/ingredientes/${id}`)}
              onOpenRecipes={() => router.push("/inventario/recetas")}
              onOpenKardex={(ingredientId) =>
                ingredientId
                  ? router.push(`/inventario/kardex?ingredientId=${encodeURIComponent(ingredientId)}`)
                  : router.push(`/inventario/kardex`)
              }
            />
          </div>
        </div>

        {/* Detail drawer for intermediate desktop (lg..xl) */}
        {selection.kind !== "none" && (
          <div className="hidden xl:hidden lg:block">
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelection({ kind: "none" })}
              aria-hidden
            />
            <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-[420px] p-3 xl:p-4">
              <div className="h-full min-h-0 overflow-hidden rounded-[28px] bg-[#F0F2F5] shadow-2xl ring-1 ring-black/10">
                <DesktopDetailPanel
                  selection={selection}
                  summary={summary}
                  products={products}
                  itemsById={itemsById}
                  kardexMovements={kardexMovements}
                  onClearSelection={() => setSelection({ kind: "none" })}
                  onOpenIngredient={(id) => router.push(`/inventario/ingredientes/${id}`)}
                  onOpenRecipes={() => router.push("/inventario/recetas")}
                  onOpenKardex={(ingredientId) =>
                    ingredientId
                      ? router.push(`/inventario/kardex?ingredientId=${encodeURIComponent(ingredientId)}`)
                      : router.push(`/inventario/kardex`)
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Mobile carousel */}
        <main className="min-h-0 flex-1 overflow-hidden lg:hidden">
          <div className="sticky top-0 z-20 bg-[#F0F2F5] px-4 pb-3 pt-4">
            <div className="mx-auto w-full max-w-md">
              <InventoryTopTabs active={activeScreen} onChange={setScreen} />
            </div>
          </div>

          <div
            ref={swipeRef}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth overscroll-x-contain"
            onScroll={() => {
              const el = swipeRef.current;
              if (!el) return;
              if (rafRef.current) cancelAnimationFrame(rafRef.current);
              rafRef.current = requestAnimationFrame(() => {
                const w = el.clientWidth || 1;
                const idx = Math.round(el.scrollLeft / w);
                const next = indexToScreen[Math.max(0, Math.min(2, idx))] ?? "home";
                if (next !== activeScreen) setActiveScreen(next);
              });
            }}
          >
            <section className="w-full shrink-0 snap-center">
              <div className="h-full min-h-0 overflow-y-auto pb-40">{mobileLists}</div>
            </section>
            <section className="w-full shrink-0 snap-center">
              <div className="h-full min-h-0 overflow-y-auto pb-40">{mobileHome}</div>
            </section>
            <section className="w-full shrink-0 snap-center">
              <div className="h-full min-h-0 overflow-y-auto pb-40">{mobileKardex}</div>
            </section>
          </div>
        </main>
      </div>

      <InventoryChatActionBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={getInventorySearchPlaceholder(activeScreen)}
        onCreateIngredient={handleCreateIngredient}
        onPickAction={handlePickAction}
        onRegisterPurchase={() => openMovementSheet("PURCHASE")}
        onRegisterPurchaseReturn={() => openMovementSheet("PURCHASE_RETURN")}
        onRegisterPositiveAdjustment={() => openMovementSheet("ADJUSTMENT_POSITIVE")}
        onRegisterNegativeAdjustment={() => openMovementSheet("ADJUSTMENT_NEGATIVE")}
        onRegisterInitial={() => openMovementSheet("INITIAL")}
      />

      {/* Modals */}
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
              await loadData();
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
        title={movementTitle[movementInitialAction]}
        subtitle="Registrar movimiento"
        onClose={() => setMovementSheetOpen(false)}
      >
        {summary.length === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
            No hay ingredientes activos para registrar movimientos.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
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
                    await loadData();
                    await loadKardexAll();
                  }}
                />
              );
            })()}
          </div>
        )}
      </ItemPanelLayout>

      <ItemPanelLayout
        open={!isDesktop && mobileDetailOpen && selection.kind !== "none"}
        title={selection.kind === "product" ? "Detalle producto" : "Detalle insumo"}
        subtitle="Vista contextual"
        onClose={() => setMobileDetailOpen(false)}
      >
        {(() => {
          if (selection.kind === "none") return null;
          if (selection.kind === "ingredient") {
            const ingredient = summary.find((s) => s.id === selection.id) ?? null;
            const recent = kardexMovements
              .filter((m) => m.ingredientId === selection.id)
              .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
              .slice(0, 8);

            return (
              <div className="space-y-4">
                <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Insumo</p>
                  <h3 className="mt-1 text-lg font-black text-neutral-900">
                    {ingredient?.name ?? "Ingrediente"}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-neutral-500">
                    {ingredient ? `${ingredient.consumptionUnit} / ${ingredient.purchaseUnit}` : "—"}
                  </p>
                </div>

                {ingredient && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Stock</p>
                      <p className="mt-1 text-sm font-black text-neutral-900">
                        {formatMoney(parseNumber(ingredient.currentStock))}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Costo</p>
                      <p className="mt-1 text-sm font-black text-neutral-900">
                        ${formatMoney(parseNumber(ingredient.averageCost))}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Valor</p>
                      <p className="mt-1 text-sm font-black text-neutral-900">
                        ${formatMoney(parseNumber(ingredient.stockValue))}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/inventario/ingredientes/${selection.id}`)}
                    className="h-12 rounded-2xl bg-white text-sm font-black text-neutral-900 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                  >
                    Abrir detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/inventario/kardex?ingredientId=${encodeURIComponent(selection.id)}`)}
                    className="h-12 rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
                  >
                    Ver kardex
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-neutral-900">Movimientos recientes</h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Kardex
                  </span>
                </div>

                {recent.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
                    Sin movimientos para mostrar.
                  </div>
                ) : (
                  <KardexList movements={recent} layout="chat" />
                )}
              </div>
            );
          }

          const selectedId = selection.id;
          const product = products.find((p) => p.itemId === selectedId) ?? null;
          const item = itemsById.get(selectedId) ?? null;
          const img =
            (item?.images ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.url ?? null;

          return (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={product?.itemName ?? "Producto"} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="h-full w-full bg-neutral-100" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Producto</p>
                    <h3 className="mt-1 line-clamp-2 text-lg font-black text-neutral-900">
                      {product?.itemName ?? "Producto"}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      {product?.inventoryMode === "RECIPE_BASED" ? "Receta basada en ingredientes" : "Stock propio"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-neutral-900">Resumen de receta</h4>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                    Activa
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {(product?.ingredients ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
                      Sin receta configurada.
                    </div>
                  ) : (
                    (product?.ingredients ?? []).map((line) => (
                      <div key={line.ingredientId} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-900">{line.name}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-neutral-400">
                            {line.quantityRequired} {line.consumptionUnit ?? ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                            line.isOptional ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-800",
                          )}
                        >
                          {line.isOptional ? "Opcional" : "Obligatorio"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/inventario/recetas?itemId=${encodeURIComponent(selectedId)}`)}
                  className="h-12 rounded-2xl bg-white text-sm font-black text-neutral-900 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                >
                  Editar receta
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/inventario/kardex`)}
                  className="h-12 rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
                >
                  Ver kardex
                </button>
              </div>
            </div>
          );
        })()}
      </ItemPanelLayout>
    </div>
  );
}
