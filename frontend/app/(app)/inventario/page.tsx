"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import { api } from "@/src/lib/api";
import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import {
  createIngredient,
  getInventorySummary,
  getRecipe,
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
import type { Item } from "@/src/types/item";
import type { ComposedProduct } from "@/src/components/inventory/types";
import { ProductInventoryFeedItem } from "@/src/components/inventory/ProductInventoryFeedItem";
import { ProductInventoryDetail } from "@/src/components/inventory/ProductInventoryDetail";
import { cn } from "@/src/lib/utils";

export default function InventarioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [products, setProducts] = useState<ComposedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [chatValue, setChatValue] = useState("");
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [prefillIngredientName, setPrefillIngredientName] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

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
        (i) => i.type === "PRODUCT" && i.inventoryMode && i.inventoryMode !== "NONE"
      );
      
      const productsWithRecipes = await Promise.all(
        inventoryProducts.map(async (product) => {
          let recipeLines: RecipeLine[] = [];
          try {
            recipeLines = await getRecipe(product.id) ?? [];
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
            stock: undefined, // Compute later if available from backend
            value: undefined,
            ingredients,
          } as ComposedProduct;
        })
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

  const openIngredientCreateFromChat = useCallback(() => {
    const text = chatValue.trim();
    if (!text) {
      toast.error("Escribí un ingrediente para crearlo o buscarlo");
      return;
    }

    setPrefillIngredientName(text);
    setIngredientSheetOpen(true);
  }, [chatValue]);

  const selectedProduct = products.find((p) => p.itemId === selectedProductId) ?? null;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0 lg:hidden">
        <AppHeader title="Inventario" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-row">
          
          {/* Main Feed Column */}
          <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-neutral-200/60 w-full lg:w-[40%]">
            <div className="hidden shrink-0 lg:block">
              <AppHeader title="Inventario" showBack hrefBack="/home" />
            </div>

            <section className="shrink-0 px-4 py-4">
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

              {!loading && !error && <InventorySummaryCards items={summary} />}
            </section>

            <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-44">
              {!loading && !error && (
                <div className="flex flex-col-reverse gap-3 py-2">
                  {/* flex-col-reverse makes it render from bottom to top like a chat */}
                  {products.map((product) => (
                    <ProductInventoryFeedItem
                      key={product.itemId}
                      product={product}
                      selected={selectedProductId === product.itemId}
                      onClick={() => {
                        setSelectedProductId(product.itemId);
                        if (window.innerWidth < 1024) {
                          setMobileDetailOpen(true);
                        }
                      }}
                    />
                  ))}
                  
                  {products.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-neutral-400">
                      No hay productos configurados con inventario.
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Desktop Detail Panel */}
          <div className="hidden shrink-0 bg-white lg:block lg:w-[60%]">
            <ProductInventoryDetail product={selectedProduct} />
          </div>
        </div>
      </main>

      <div className="z-10 lg:fixed lg:bottom-0 lg:left-0 lg:w-[40%] lg:max-w-[480px] lg:pl-[max(0px,calc(50vw-600px))]">
        <InventoryChatActionBar
          value={chatValue}
          onChange={setChatValue}
          onSubmit={openIngredientCreateFromChat}
          onPickAction={handlePickAction}
          placeholder="Buscar o crear en inventario..."
        />
      </div>

      {/* Mobile Detail Panel */}
      <ItemPanelLayout
        open={mobileDetailOpen}
        title="Detalle"
        subtitle="Producto/Receta"
        onClose={() => setMobileDetailOpen(false)}
      >
        <div className="h-full pb-4">
          <ProductInventoryDetail product={selectedProduct} />
        </div>
      </ItemPanelLayout>

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
              setChatValue("");
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
