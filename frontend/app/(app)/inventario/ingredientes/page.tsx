"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import {
  createIngredient,
  getInventorySummary,
  type InventorySummaryIngredient,
  type IngredientStatus,
} from "@/src/services/inventory";
import { IngredientList } from "@/src/components/inventory/IngredientList";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";

export default function IngredientesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IngredientStatus>("ACTIVE");
  const [ingredients, setIngredients] = useState<InventorySummaryIngredient[]>([]);

  const [chatValue, setChatValue] = useState("");
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false);
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInventorySummary({ status });
      setIngredients(data ?? []);
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "No se pudieron cargar los ingredientes");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedIngredients = useMemo(() => {
    const sorted = [...ingredients].sort((a, b) => {
      const at = new Date(a.createdAt ?? 0).getTime();
      const bt = new Date(b.createdAt ?? 0).getTime();
      return bt - at;
    });

    const q = chatValue.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, chatValue]);

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
    setIngredientSheetOpen(true);
  }, [chatValue]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Ingredientes" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
        <div className="mx-auto w-full max-w-md px-4 py-4">
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Filtro
              </p>
              <p className="mt-1 text-sm font-bold text-neutral-900">
                {status === "ACTIVE" ? "Ingredientes activos" : "Ingredientes inactivos"}
              </p>
              <div className="mt-3 flex rounded-full bg-neutral-100 p-1">
                {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex-1 rounded-full py-2 text-xs font-bold transition",
                      status === s ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500",
                    )}
                  >
                    {s === "ACTIVE" ? "Activos" : "Inactivos"}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
                Cargando...
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">
                {error}
              </div>
            )}

            {!loading && !error && (
              <IngredientList
                layout="chat"
                ingredients={orderedIngredients}
                onSelect={(id) => router.push(`/inventario/ingredientes/${id}`)}
              />
            )}
          </div>
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={openIngredientCreateFromChat}
        onPickAction={handlePickAction}
        placeholder="Buscar o crear ingrediente..."
        helperText="Escribí para filtrar o crear. Usá el + para navegar."
      />

      <ItemPanelLayout
        open={ingredientSheetOpen}
        title="Nuevo ingrediente"
        subtitle="Crear desde el chat"
        onClose={() => setIngredientSheetOpen(false)}
      >
        <IngredientForm
          mode="create"
          defaults={{ name: chatValue.trim() }}
          submitting={creatingIngredient}
          onCancel={() => setIngredientSheetOpen(false)}
          onSubmit={async (values) => {
            const loadingId = "ingredients-chat-create-loading";
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
