"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, PencilLine, Power, RefreshCcw } from "lucide-react";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import { deactivateIngredient, getIngredient, type Ingredient } from "@/src/services/inventory";
import { MovementForm } from "@/src/components/inventory/MovementForm";
import { parseNumber } from "@/src/components/inventory/inventoryUtils";
import { formatMoney } from "@/src/lib/formatters";

export default function IngredienteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const ingredientId = params.id;
  const [loading, setLoading] = useState(true);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getIngredient(ingredientId);
      setIngredient(data);
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "No se pudo cargar el ingrediente");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [ingredientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDeactivate = async () => {
    if (!ingredient) return;
    const loadingId = "ingredient-deactivate-loading";
    try {
      setDeactivating(true);
      toast.loading("Desactivando...", { id: loadingId });
      await deactivateIngredient(ingredient.id);
      toast.dismiss(loadingId);
      toast.success("Ingrediente desactivado");
      await load();
    } catch (err) {
      console.error(err);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(err, "No se pudo desactivar"));
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Detalle ingrediente" showBack hrefBack="/inventario/ingredientes" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
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

          {!loading && ingredient && (
            <>
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                      Ingrediente
                    </p>
                    <h2 className="mt-1 truncate text-lg font-bold text-neutral-900">{ingredient.name}</h2>
                    <p className="mt-1 text-xs font-medium text-neutral-400">
                      Consumo: {ingredient.consumptionUnit} &middot; Compra: {ingredient.purchaseUnit}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void load()}
                    className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-700 active:scale-95"
                    aria-label="Recargar"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Stock</p>
                    <p className="mt-1 text-sm font-black text-neutral-900">
                      {formatMoney(parseNumber(ingredient.currentStock))} {ingredient.consumptionUnit}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-neutral-400">Solo v&iacute;a movimientos</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Costo prom.</p>
                    <p className="mt-1 text-sm font-black text-neutral-900">
                      ${formatMoney(parseNumber(ingredient.averageCost))}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-neutral-400">Se recalcula autom&aacute;ticamente</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/inventario/ingredientes/${ingredient.id}/editar`)}
                    className="flex min-h-[70px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]"
                  >
                    <PencilLine className="h-5 w-5 text-neutral-700" />
                    <p className="mt-2 text-xs font-black text-neutral-900">Editar</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/inventario/kardex?ingredientId=${ingredient.id}`)}
                    className="flex min-h-[70px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]"
                  >
                    <BookOpen className="h-5 w-5 text-neutral-700" />
                    <p className="mt-2 text-xs font-black text-neutral-900">Kardex</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeactivate()}
                    disabled={deactivating || ingredient.status !== "ACTIVE"}
                    className="flex min-h-[70px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99] disabled:opacity-50"
                  >
                    <Power className="h-5 w-5 text-rose-600" />
                    <p className="mt-2 text-xs font-black text-neutral-900">Desactivar</p>
                  </button>
                </div>
              </div>

              <MovementForm ingredient={ingredient} onSuccess={load} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
