"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import {
  createIngredient,
  getInventorySummary,
  type InventorySummaryIngredient,
} from "@/src/services/inventory";
import { InventorySummaryCards } from "@/src/components/inventory/InventorySummaryCards";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";

export default function InventarioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [chatValue, setChatValue] = useState("");
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [prefillIngredientName, setPrefillIngredientName] = useState("");
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInventorySummary({ status: "ACTIVE" });
      setSummary(data ?? []);
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
    void loadSummary();
  }, [loadSummary]);

  const latestIngredients = useMemo(() => {
    const sorted = [...summary].sort((a, b) => {
      const at = new Date(a.createdAt ?? 0).getTime();
      const bt = new Date(b.createdAt ?? 0).getTime();
      return bt - at;
    });
    return sorted.slice(0, 12);
  }, [summary]);

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

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Inventario" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-md flex-col">
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
              <div className="flex flex-col gap-4 py-2">
                <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Conversación
                      </p>
                      <p className="mt-1 text-sm font-bold text-neutral-900">
                        Ingredientes recientes
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/inventario/ingredientes")}
                      className="text-[10px] font-black uppercase tracking-widest text-neutral-400"
                    >
                      Ver todos
                    </button>
                  </div>
                </div>

                <IngredientList
                  layout="chat"
                  ingredients={latestIngredients}
                  onSelect={(id) => router.push(`/inventario/ingredientes/${id}`)}
                />
              </div>
            )}
          </section>
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={openIngredientCreateFromChat}
        onPickAction={handlePickAction}
        placeholder="Buscar o crear en inventario..."
      />

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
              await loadSummary();
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
