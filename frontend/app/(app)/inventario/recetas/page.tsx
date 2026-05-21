"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { api } from "@/src/lib/api";
import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney } from "@/src/lib/formatters";
import { DateSeparator } from "@/src/components/shared/DateSeparator";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import {
  getInventorySummary,
  getRecipe,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import type { Item } from "@/src/types/item";
import type { ComposedProduct } from "@/src/components/inventory/types";
import { RecipeEditor } from "@/src/components/inventory/RecipeEditor";

function RecetasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [itemId, setItemId] = useState<string | null>(null);
  const [chatValue, setChatValue] = useState("");
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [products, setProducts] = useState<ComposedProduct[]>([]);

  useEffect(() => {
    const id = searchParams?.get("itemId");
    if (id) setItemId(id);
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, itemsData] = await Promise.all([
        getInventorySummary({ status: "ACTIVE" }),
        api<Item[]>("/items?status=ACTIVE").catch(() => []),
      ]);

      setSummary(summaryData ?? []);

      const inventoryProducts = (itemsData ?? []).filter(
        (i) => i.type === "PRODUCT" && i.inventoryMode && i.inventoryMode !== "NONE",
      );

      const productsWithRecipes = await Promise.all(
        inventoryProducts.map(async (product) => {
          let recipeLines: RecipeLine[] = [];
          try {
            recipeLines = (await getRecipe(product.id)) ?? [];
          } catch (e) {
            console.error("Failed to load recipe for", product.id, e);
          }

          const ingredients = recipeLines.map((line) => {
            const summaryIng = summaryData?.find((s) => s.id === line.ingredientId);
            return {
              ingredientId: line.ingredientId,
              name: summaryIng?.name ?? "Desconocido",
              quantityRequired: line.quantityRequired,
              consumptionUnit: summaryIng?.consumptionUnit,
              customUnitLabel: summaryIng?.customUnitLabel,
              isOptional: !!line.isOptional,
              currentStock: summaryIng?.currentStock,
              averageCost: summaryIng?.averageCost,
            };
          });

          return {
            itemId: product.id,
            itemName: product.name,
            itemType: product.type,
            inventoryMode: product.inventoryMode!,
            price: product.price,
            stock: undefined,
            value: undefined,
            ingredients,
          } as ComposedProduct;
        }),
      );

      setProducts(productsWithRecipes);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "No se pudo cargar las recetas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visible = useMemo(() => {
    const q = chatValue.trim().toLowerCase();
    return products
      .filter((p) => p.inventoryMode === "SIMPLE" || p.inventoryMode === "RECIPE_BASED")
      .filter((p) => !q || p.itemName.toLowerCase().includes(q));
  }, [products, chatValue]);

  const recipeStatus = (p: ComposedProduct) => {
    const mandatory = (p.ingredients ?? []).filter((l: any) => !l.isOptional);
    const anyInvalid = (p.ingredients ?? []).some(
      (l: any) => !l.ingredientId || !Number.isFinite(l.quantityRequired) || l.quantityRequired <= 0,
    );

    if (p.inventoryMode === "SIMPLE") {
      const ok = mandatory.length === 1 && (p.ingredients ?? []).length === 1 && !anyInvalid;
      return ok
        ? { ok: true, label: "Completa", tone: "bg-emerald-50 text-emerald-800" }
        : { ok: false, label: "Falta configurar", tone: "bg-rose-50 text-rose-700" };
    }

    if (p.inventoryMode === "RECIPE_BASED") {
      const ok = mandatory.length >= 1 && !anyInvalid;
      return ok
        ? { ok: true, label: "Completa", tone: "bg-emerald-50 text-emerald-800" }
        : { ok: false, label: "Falta configurar", tone: "bg-rose-50 text-rose-700" };
    }

    return { ok: true, label: "OK", tone: "bg-neutral-100 text-neutral-600" };
  };

  const estimatedCost = (p: ComposedProduct) => {
    return (p.ingredients ?? []).reduce((acc: number, ing: any) => {
      const qty = Number(ing.quantityRequired);
      const cost = Number(String(ing.averageCost ?? "0").replace(",", "."));
      if (!Number.isFinite(qty) || !Number.isFinite(cost)) return acc;
      return acc + qty * cost;
    }, 0);
  };

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
    setPurchaseReturnOpen(true);
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Recetas" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <section className="relative overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/40 p-3 shadow-sm ring-1 ring-black/5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.035)_1px,transparent_0)] bg-[size:18px_18px] opacity-40" />
            <div className="relative space-y-3">
              <DateSeparator dateISO={new Date().toISOString().slice(0, 10)} labelOverride="Hoy" />

              {loading && (
                <div className="w-fit max-w-full rounded-2xl bg-white/90 px-4 py-3 text-sm font-medium text-neutral-500 shadow-sm ring-1 ring-black/5">
                  Cargando recetas...
                </div>
              )}

              {!loading && error && (
                <div className="w-fit max-w-full rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
                  {error}
                </div>
              )}

              {!loading && !error && visible.length === 0 && (
                <div className="w-fit max-w-full rounded-2xl border border-dashed border-neutral-200 bg-white/70 px-4 py-3 text-sm font-medium text-neutral-500">
                  No hay recetas para mostrar.
                </div>
              )}

              {!loading &&
                !error &&
                visible.map((p) => {
                  const status = recipeStatus(p);
                  const cost = estimatedCost(p);
                  const margin = Number.isFinite(Number(p.price)) ? Number(p.price) - cost : null;
                  const isSelected = p.itemId === itemId;

                  return (
                    <article
                      key={p.itemId}
                      className="w-full rounded-3xl rounded-tl-none border border-neutral-200/70 bg-white/90 p-4 shadow-sm ring-1 ring-black/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-900">{p.itemName}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">
                              {p.inventoryMode === "SIMPLE" ? "Stock simple" : "Receta"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${status.tone}`}
                            >
                              {status.label}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            Precio
                          </p>
                          <p className="mt-1 text-sm font-black text-neutral-900">${formatMoney(p.price ?? 0)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                        <div>
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Ingredientes</p>
                          <p className="mt-1 font-black text-neutral-800">{p.ingredients?.length ?? 0}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Costo est.</p>
                          <p className="mt-1 font-black text-neutral-800">${formatMoney(cost)}</p>
                        </div>
                        <div>
                          <p className="font-bold uppercase tracking-widest text-neutral-400">Margen est.</p>
                          <p className={`mt-1 font-black ${margin === null ? "text-neutral-800" : margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {margin === null ? "—" : `${margin >= 0 ? "+" : "-"}$${formatMoney(Math.abs(margin))}`}
                          </p>
                        </div>
                      </div>

                      {(p.ingredients?.length ?? 0) > 0 && (
                        <div className="mt-3 rounded-2xl bg-neutral-50 p-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                            Requeridos
                          </p>
                          <div className="mt-2 space-y-1">
                            {(p.ingredients ?? [])
                              .filter((l: any) => !l.isOptional)
                              .slice(0, 4)
                              .map((ing: any) => (
                                <div key={ing.ingredientId} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="truncate font-medium text-neutral-700">{ing.name}</span>
                                  <span className="shrink-0 font-semibold text-neutral-500">
                                    {ing.quantityRequired} {ing.customUnitLabel || ing.consumptionUnit}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setItemId(p.itemId)}
                          className={
                            isSelected
                              ? "h-9 rounded-2xl bg-neutral-900 px-4 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                              : "h-9 rounded-2xl bg-white px-4 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                          }
                        >
                          Editar receta
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push("/inventario/kardex")}
                          className="h-9 rounded-2xl bg-white px-4 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                        >
                          Ver kardex
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push("/inventario")}
                          className="h-9 rounded-2xl bg-white px-4 text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                        >
                          Cargar insumo
                        </button>
                      </div>
                    </article>
                  );
                })}

              {!loading && !error && itemId && (
                <div className="w-fit max-w-full rounded-2xl bg-white/90 px-4 py-3 text-sm font-medium text-neutral-500 shadow-sm ring-1 ring-black/5">
                  Se abrió el editor de receta. Guardá para aplicar los cambios.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={() => toast("Usá los chips/acciones visibles. El input solo filtra.")}
        onPickAction={handlePickAction}
        placeholder="Buscar producto o receta..."
        helperText="Escrib\u00ED para filtrar. Us\u00E1 el + para navegar."
      />

      <ItemPanelLayout
        open={Boolean(itemId)}
        title="Editar receta"
        subtitle="Configurar consumo de insumos"
        onClose={() => setItemId(null)}
      >
        <RecipeEditor
          selectedItemId={itemId}
          onSelectItemId={(next) => setItemId(next)}
          searchValue={chatValue}
          onSearchChange={setChatValue}
          hideSearchInput
        />
      </ItemPanelLayout>

      <ItemPanelLayout
        open={purchaseReturnOpen}
        title="Devoluci\u00F3n de compras"
        subtitle="Pr\u00F3ximamente"
        onClose={() => setPurchaseReturnOpen(false)}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
          Devoluci\u00F3n de compras estar\u00E1 disponible pr\u00F3ximamente
        </div>
        <button
          type="button"
          onClick={() => setPurchaseReturnOpen(false)}
          className="h-12 w-full rounded-2xl bg-neutral-900 text-sm font-black text-white shadow-sm transition active:scale-[0.99]"
        >
          Entendido
        </button>
      </ItemPanelLayout>
    </div>
  );
}

export default function RecetasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
          <div className="shrink-0">
            <AppHeader title="Recetas" showBack hrefBack="/inventario" />
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto pb-44">
            <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
              <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
                Cargando recetas...
              </div>
            </div>
          </main>
        </div>
      }
    >
      <RecetasPageContent />
    </Suspense>
  );
}
