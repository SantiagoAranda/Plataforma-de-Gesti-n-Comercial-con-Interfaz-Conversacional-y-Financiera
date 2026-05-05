"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { api } from "@/src/lib/api";
import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import { formatMoney } from "@/src/lib/formatters";
import {
  createIngredient,
  getInventorySummary,
  listKardex,
  getRecipe,
  type InventoryMovement,
  type InventoryMovementType,
  type InventorySummaryIngredient,
  type RecipeLine,
} from "@/src/services/inventory";
import { InventorySummaryCards } from "@/src/components/inventory/InventorySummaryCards";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { DateSeparator } from "@/src/components/shared/DateSeparator";
import type { Item } from "@/src/types/item";
import type { ComposedProduct } from "@/src/components/inventory/types";
import { ProductInventoryFeedItem } from "@/src/components/inventory/ProductInventoryFeedItem";

type InventoryScreen = "lists" | "home" | "kardex";
type InventoryListTab = "ingredients" | "products";
type KardexDirectionFilter = "all" | "in" | "out";

function getInventorySearchPlaceholder(screen: InventoryScreen) {
  if (screen === "home") return "Buscar en inventario...";
  if (screen === "lists") return "Buscar insumo o producto...";
  if (screen === "kardex") return "Buscar movimiento...";
  return "Buscar...";
}

function InventoryListsScreen({
  activeTab,
  onChangeTab,
  ingredients,
  products,
}: {
  activeTab: InventoryListTab;
  onChangeTab: (tab: InventoryListTab) => void;
  ingredients: InventorySummaryIngredient[];
  products: ComposedProduct[];
}) {
  return (
    <section className="space-y-3">
      <div className="rounded-3xl border border-neutral-200/70 bg-white/70 p-2 shadow-sm ring-1 ring-black/5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeTab("ingredients")}
            className={
              activeTab === "ingredients"
                ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
            }
          >
            Insumos
          </button>
          <button
            type="button"
            onClick={() => onChangeTab("products")}
            className={
              activeTab === "products"
                ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
            }
          >
            Productos
          </button>
        </div>
      </div>

      {activeTab === "ingredients" && (
        <IngredientList
          ingredients={ingredients}
          onSelect={() => {
            // Placeholder: por ahora, sin navegación.
          }}
          layout="chat"
        />
      )}

      {activeTab === "products" && (
        <div className="space-y-3">
          {products.map((product) => (
            <ProductInventoryFeedItem
              key={product.itemId}
              product={product}
              onClick={() => {
                // Placeholder: por ahora, sin navegación.
              }}
            />
          ))}

          {products.length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6 text-center text-sm text-neutral-400">
              Todavía no hay productos configurados.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type InventoryKardexMovement = InventoryMovement & {
  itemName: string;
};

function isInventoryOutput(type: InventoryMovementType) {
  return type === "SALE" || type === "ADJUSTMENT_NEGATIVE" || type === "PURCHASE_RETURN";
}

function movementLabel(type: InventoryMovementType) {
  if (type === "SALE") return "Venta";
  if (type === "SALE_RETURN") return "Dev. venta";
  if (type === "PURCHASE") return "Compra";
  if (type === "INVENTORY_INITIAL") return "Inicial";
  if (type === "ADJUSTMENT_POSITIVE") return "Ajuste +";
  if (type === "ADJUSTMENT_NEGATIVE") return "Ajuste -";
  if (type === "PURCHASE_RETURN") return "Dev. compra";
  return type;
}

function InventoryKardexScreen({
  loading,
  error,
  movements,
  searchQuery,
}: {
  loading: boolean;
  error: string | null;
  movements: InventoryKardexMovement[];
  searchQuery: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [direction, setDirection] = useState<KardexDirectionFilter>("all");
  const [movementType, setMovementType] = useState<InventoryMovementType | "all">("all");

  const q = searchQuery.trim().toLowerCase();

  const visible = movements
    .filter((m) => {
      if (direction === "all") return true;
      const out = isInventoryOutput(m.type);
      return direction === "out" ? out : !out;
    })
    .filter((m) => (movementType === "all" ? true : m.type === movementType))
    .filter((m) => {
      if (!q) return true;
      const name = m.itemName.toLowerCase();
      const detail = (m.detail ?? "").toLowerCase();
      const type = m.type.toLowerCase();
      const ref = (m.referenceId ?? "").toLowerCase();
      return name.includes(q) || detail.includes(q) || type.includes(q) || ref.includes(q);
    })
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  const typeOptions: Array<{ value: InventoryMovementType | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "INVENTORY_INITIAL", label: "Inicial" },
    { value: "PURCHASE", label: "Compra" },
    { value: "SALE", label: "Venta" },
    { value: "SALE_RETURN", label: "Dev. venta" },
    { value: "PURCHASE_RETURN", label: "Dev. compra" },
    { value: "ADJUSTMENT_POSITIVE", label: "Ajuste +" },
    { value: "ADJUSTMENT_NEGATIVE", label: "Ajuste -" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
          Kardex
        </p>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm transition active:scale-[0.99]"
        >
          Filtro
        </button>
      </div>

      {filtersOpen && (
        <div className="rounded-3xl border border-neutral-200/70 bg-white/70 p-3 shadow-sm ring-1 ring-black/5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Entrada/Salida
              </p>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as KardexDirectionFilter)}
                className="h-11 w-full rounded-2xl border border-neutral-100 bg-white px-4 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                <option value="all">Todas</option>
                <option value="in">Entradas</option>
                <option value="out">Salidas</option>
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Tipo
              </p>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as InventoryMovementType | "all")}
                className="h-11 w-full rounded-2xl border border-neutral-100 bg-white px-4 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
          Cargando movimientos...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6 text-center text-sm text-neutral-400">
          Todavía no hay movimientos de inventario.
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="flex flex-col-reverse gap-3">
          {visible.map((m, idx) => {
            const dayKey = m.occurredAt.slice(0, 10);
            const prevDayKey = idx > 0 ? visible[idx - 1].occurredAt.slice(0, 10) : null;
            const showSeparator = dayKey !== prevDayKey;

            const qty = parseNumber(m.quantity);
            const unitCost = parseNumber(m.unitCost);
            const totalValue = parseNumber(m.totalValue);
            const stockAfter = parseNumber(m.stockAfter);
            const avgAfter = parseNumber(m.averageCostAfter);

            const out = isInventoryOutput(m.type);
            const impactSign = out ? "-" : "+";
            const impactTone = out ? "text-rose-600" : "text-emerald-600";
            const badgeTone = out ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700";
            const badgeText = out ? "SALIDA" : "ENTRADA";
            const typeText = movementLabel(m.type);

            return (
              <div key={m.id} className="space-y-3">
                {showSeparator && <DateSeparator dateISO={dayKey} />}

                <article className="rounded-2xl rounded-tl-none border border-neutral-100 bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-neutral-900">
                        {m.itemName}
                      </p>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-neutral-500">
                        {m.detail ?? "Movimiento de inventario"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right space-y-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeTone}`}>
                        {badgeText}
                      </span>
                      <span className="block rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-700">
                        {new Date(m.occurredAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-600">
                      {typeText}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${badgeTone}`}>
                      {impactSign}
                      {formatMoney(qty)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 text-[10px]">
                    <div>
                      <p className="font-bold uppercase tracking-widest text-neutral-400">Impacto</p>
                      <p className={`mt-1 font-black ${impactTone}`}>
                        {impactSign}
                        {formatMoney(qty)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold uppercase tracking-widest text-neutral-400">Saldo después</p>
                      <p className="mt-1 font-black text-neutral-800">{formatMoney(stockAfter)}</p>
                    </div>
                    <div>
                      <p className="font-bold uppercase tracking-widest text-neutral-400">Costo unit.</p>
                      <p className="mt-1 font-black text-neutral-800">${formatMoney(unitCost)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold uppercase tracking-widest text-neutral-400">Valor</p>
                      <p className="mt-1 font-black text-neutral-800">${formatMoney(totalValue)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-bold uppercase tracking-widest text-neutral-400">Costo prom. después</p>
                      <p className="mt-1 font-black text-neutral-800">${formatMoney(avgAfter)}</p>
                    </div>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InventoryHomeActual({
  loading,
  error,
  summary,
  products,
}: {
  loading: boolean;
  error: string | null;
  summary: InventorySummaryIngredient[];
  products: ComposedProduct[];
}) {
  return (
    <>
      {loading && (
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
          Cargando inventario...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <InventorySummaryCards items={summary} />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
                Recetas
              </p>
            </div>

            <div className="space-y-3">
              {products.map((product) => (
                <ProductInventoryFeedItem
                  key={product.itemId}
                  product={product}
                  onClick={() => {
                    // Por ahora, sin acción desde el Home.
                  }}
                />
              ))}

              {products.length === 0 && (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6 text-center text-sm text-neutral-400">
                  Todavía no hay recetas configuradas.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function InventarioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [products, setProducts] = useState<ComposedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [kardexLoading, setKardexLoading] = useState(false);
  const [kardexError, setKardexError] = useState<string | null>(null);
  const [kardexMovements, setKardexMovements] = useState<InventoryKardexMovement[]>([]);

  const [activeScreen, setActiveScreen] = useState<InventoryScreen>("home");
  const [activeListTab, setActiveListTab] = useState<InventoryListTab>("ingredients");

  const [searchQuery, setSearchQuery] = useState("");
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [prefillIngredientName, setPrefillIngredientName] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);

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
              isOptional: !!line.isOptional,
              currentStock: summaryIng?.currentStock,
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
      const msg = getErrorMessage(err, "No se pudo cargar el inventario");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadKardex = useCallback(async () => {
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
      toast.error(msg);
      setKardexMovements([]);
    } finally {
      setKardexLoading(false);
    }
  }, [summary]);

  useEffect(() => {
    if (activeScreen !== "kardex") return;
    void loadKardex();
  }, [activeScreen, loadKardex]);

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

  const handleCreateIngredient = useCallback(() => {
    const text = searchQuery.trim();
    if (!text) toast("Crear ingrediente");

    setPrefillIngredientName(text);
    setIngredientSheetOpen(true);
  }, [searchQuery]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Inventario" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <div className="rounded-3xl border border-neutral-200/70 bg-white/70 p-2 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setActiveScreen("lists")}
                className={
                  activeScreen === "lists"
                    ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                    : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                }
              >
                ← Listas
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen("home")}
                className={
                  activeScreen === "home"
                    ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                    : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                }
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen("kardex")}
                className={
                  activeScreen === "kardex"
                    ? "h-10 rounded-2xl bg-neutral-900 text-xs font-black text-white shadow-sm transition active:scale-[0.99]"
                    : "h-10 rounded-2xl bg-white text-xs font-black text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                }
              >
                Kardex →
              </button>
            </div>
          </div>

          {activeScreen === "lists" && (
            <InventoryListsScreen
              activeTab={activeListTab}
              onChangeTab={setActiveListTab}
              ingredients={summary}
              products={products}
            />
          )}
          {activeScreen === "home" && (
            <InventoryHomeActual
              loading={loading}
              error={error}
              summary={summary}
              products={products}
            />
          )}
          {activeScreen === "kardex" && (
            <InventoryKardexScreen
              loading={kardexLoading}
              error={kardexError}
              movements={kardexMovements}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </main>

      <InventoryChatActionBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={getInventorySearchPlaceholder(activeScreen)}
        onCreateIngredient={handleCreateIngredient}
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
        open={purchaseReturnOpen}
        title="Devolución de compras"
        subtitle="Próximamente"
        onClose={() => setPurchaseReturnOpen(false)}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
          Devolución de compras estará disponible próximamente
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
