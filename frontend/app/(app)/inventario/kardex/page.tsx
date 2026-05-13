"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import {
  listIngredients,
  listKardex,
  type Ingredient,
  type InventoryMovement,
  type InventoryMovementType,
} from "@/src/services/inventory";
import { KardexList } from "@/src/components/inventory/KardexList";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";

export default function KardexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialIngredientId = searchParams.get("ingredientId");

  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientId, setIngredientId] = useState<string>(initialIngredientId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [movementType, setMovementType] = useState<InventoryMovementType | "all">("all");

  const [loadingKardex, setLoadingKardex] = useState(false);
  const [kardex, setKardex] = useState<InventoryMovement[]>([]);

  const [chatValue, setChatValue] = useState("");
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listIngredients({ status: "ACTIVE" });
        setIngredients(data ?? []);
      } catch (err) {
        console.error(err);
        toast.error(getErrorMessage(err, "No se pudo cargar ingredientes"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredIngredients = useMemo(() => {
    const q = chatValue.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, chatValue]);

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

  const visibleMovements = useMemo(() => {
    const q = chatValue.trim().toLowerCase();

    return kardex
      .filter((m) => (movementType === "all" ? true : m.type === movementType))
      .filter((m) => {
        if (!q) return true;
      const t = m.type?.toLowerCase?.() ?? "";
      const d = m.detail?.toLowerCase?.() ?? "";
      const r = m.referenceId?.toLowerCase?.() ?? "";
      return t.includes(q) || d.includes(q) || r.includes(q);
      });
  }, [kardex, chatValue, movementType]);

  const movementTypeOptions: Array<{ value: InventoryMovementType | "all"; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "INVENTORY_INITIAL", label: "Inventario inicial" },
    { value: "PURCHASE", label: "Compra" },
    { value: "PURCHASE_RETURN", label: "Devolución compra" },
    { value: "SALE", label: "Venta" },
    { value: "SALE_RETURN", label: "Devolución venta" },
    { value: "ADJUSTMENT_POSITIVE", label: "Ajuste +" },
    { value: "ADJUSTMENT_NEGATIVE", label: "Ajuste -" },
  ];

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
        <AppHeader title="Kardex" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
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
                {filteredIngredients.map((ing) => (
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

              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Tipo de movimiento
                </p>
                <div className="mt-2 -mx-4 overflow-x-auto px-4">
                  <div className="flex w-max gap-2 pb-1">
                    {movementTypeOptions.map((opt) => {
                      const active = movementType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMovementType(opt.value)}
                          className={
                            active
                              ? "h-9 rounded-full bg-neutral-900 px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition active:scale-[0.99]"
                              : "h-9 rounded-full bg-neutral-100 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
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
          ) : !ingredientId ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
              Seleccioná un insumo para ver sus movimientos.
            </div>
          ) : (
            <KardexList movements={visibleMovements} layout="chat" />
          )}
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={() => toast("Usá el menú + para seleccionar una acción")}
        onPickAction={handlePickAction}
        placeholder="Buscar movimiento o ingrediente..."
        helperText="Escribí para filtrar. Usá el + para navegar."
      />

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

