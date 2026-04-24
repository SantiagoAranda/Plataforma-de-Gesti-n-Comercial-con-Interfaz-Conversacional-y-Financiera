"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import { listIngredients, listKardex, type Ingredient, type InventoryMovement } from "@/src/services/inventory";
import { KardexList } from "@/src/components/inventory/KardexList";

export default function KardexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialIngredientId = searchParams.get("ingredientId");

  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientId, setIngredientId] = useState<string>(initialIngredientId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loadingKardex, setLoadingKardex] = useState(false);
  const [kardex, setKardex] = useState<InventoryMovement[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listIngredients({ status: "ACTIVE" });
        setIngredients(data ?? []);
        if (!ingredientId && data?.[0]?.id) setIngredientId(data[0].id);
      } catch (err) {
        console.error(err);
        toast.error(getErrorMessage(err, "No se pudo cargar ingredientes"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId],
  );

  const loadKardex = useCallback(async () => {
    if (!ingredientId) return;
    try {
      setLoadingKardex(true);
      const movements = await listKardex(ingredientId, {
        from: from || undefined,
        to: to || undefined,
      });
      setKardex(movements ?? []);
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, "No se pudo cargar el kardex"));
      setKardex([]);
    } finally {
      setLoadingKardex(false);
    }
  }, [ingredientId, from, to]);

  useEffect(() => {
    void loadKardex();
  }, [loadKardex]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Kardex" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          {loading ? (
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
              Cargando...
            </div>
          ) : (
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Ingrediente
              </p>
              <select
                value={ingredientId}
                onChange={(e) => {
                  const next = e.target.value;
                  setIngredientId(next);
                  router.replace(`/inventario/kardex?ingredientId=${encodeURIComponent(next)}`);
                }}
                className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                <option value="">Seleccionar...</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </select>

              {selectedIngredient && (
                <p className="mt-2 text-xs font-medium text-neutral-400">
                  Unidad: {selectedIngredient.consumptionUnit}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void loadKardex()}
                className="mt-4 h-11 w-full rounded-2xl bg-neutral-900 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition active:scale-[0.99]"
                disabled={!ingredientId || loadingKardex}
              >
                {loadingKardex ? "Cargando..." : "Actualizar"}
              </button>
            </div>
          )}

          {loadingKardex ? (
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
              Cargando movimientos...
            </div>
          ) : (
            <KardexList movements={kardex} />
          )}
        </div>
      </main>
    </div>
  );
}

