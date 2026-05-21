"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Filter } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import {
  listIngredients,
  type Ingredient,
  getInventoryKardex,
  type InventoryKardexGlobalMovement,
  type InventoryMovementType,
} from "@/src/services/inventory";
import { KardexList } from "@/src/components/inventory/KardexList";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";
import { formatUnit } from "@/src/components/inventory/unitLabels";

function KardexPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialIngredientId = searchParams.get("ingredientId");

  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientId, setIngredientId] = useState<string>(initialIngredientId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [movementType, setMovementType] = useState<InventoryMovementType | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [draftIngredientId, setDraftIngredientId] = useState<string>(initialIngredientId ?? "");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftMovementType, setDraftMovementType] = useState<InventoryMovementType | "all">("all");

  const [loadingKardex, setLoadingKardex] = useState(false);
  const [kardex, setKardex] = useState<InventoryKardexGlobalMovement[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

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

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId],
  );

  useEffect(() => {
    setPage(1);
  }, [ingredientId, from, to, movementType]);

  const loadKardex = useCallback(async () => {
    try {
      setLoadingKardex(true);
      const result = await getInventoryKardex({
        ingredientId: ingredientId || undefined,
        type: movementType === "all" ? undefined : movementType,
        dateFrom: from || undefined,
        dateTo: to || undefined,
        page,
        limit,
      });
      setKardex(result?.data ?? []);
      setTotalPages(result?.meta?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, "No se pudo cargar el kardex"));
      setKardex([]);
      setTotalPages(1);
    } finally {
      setLoadingKardex(false);
    }
  }, [ingredientId, movementType, from, to, page, limit]);

  useEffect(() => {
    void loadKardex();
  }, [loadKardex]);

  const visibleMovements = useMemo(() => {
    const q = chatValue.trim().toLowerCase();

    return kardex
      .filter((m) => {
        if (!q) return true;
        const t = m.type?.toLowerCase?.() ?? "";
        const d = m.detail?.toLowerCase?.() ?? "";
        const r = m.referenceId?.toLowerCase?.() ?? "";
        const ing = m.ingredient?.name?.toLowerCase?.() ?? "";
        return t.includes(q) || d.includes(q) || r.includes(q) || ing.includes(q);
      });
  }, [kardex, chatValue]);

  const movementsForList = useMemo(() => {
    if (ingredientId) return visibleMovements;
    return visibleMovements.map((m) => {
      const ingName = m.ingredient?.name ?? "";
      const nextDetail =
        !ingName ? m.detail : m.detail ? `${ingName}: ${m.detail}` : `${ingName}`;
      return { ...m, detail: nextDetail };
    });
  }, [visibleMovements, ingredientId]);

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
        <AppHeader
          title="Kardex"
          showBack
          hrefBack="/inventario"
          rightIcon={<Filter className="h-5 w-5" />}
          rightAriaLabel="Filtros"
          onRightClick={() => {
            setDraftIngredientId(ingredientId);
            setDraftFrom(from);
            setDraftTo(to);
            setDraftMovementType(movementType);
            setFilterQuery("");
            setFiltersOpen(true);
          }}
        />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          {/*
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
                  router.replace(
                    next
                      ? `/inventario/kardex?ingredientId=${encodeURIComponent(next)}`
                      : "/inventario/kardex",
                  );
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
                  Unidad: {formatUnit(selectedIngredient.consumptionUnit)}
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
                disabled={loadingKardex}
              >
                {loadingKardex ? "Cargando..." : "Actualizar"}
              </button>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-9 rounded-full bg-neutral-100 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99] disabled:opacity-40"
                  disabled={loadingKardex || page <= 1}
                >
                  Anterior
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-9 rounded-full bg-neutral-100 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99] disabled:opacity-40"
                  disabled={loadingKardex || page >= totalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
          */}

          {selectedIngredient && !loading && (
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Ingrediente</p>
              <p className="mt-1 text-sm font-black text-neutral-900">{selectedIngredient.name}</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">
                Unidad: {formatUnit(selectedIngredient.consumptionUnit)}
              </p>
            </div>
          )}

          {loadingKardex ? (
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
              Cargando movimientos...
            </div>
          ) : (
            <KardexList movements={movementsForList} layout="chat" />
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-9 rounded-full bg-white px-4 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99] disabled:opacity-40"
              disabled={loadingKardex || page <= 1}
            >
              Anterior
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-9 rounded-full bg-white px-4 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-black/5 transition active:scale-[0.99] disabled:opacity-40"
              disabled={loadingKardex || page >= totalPages}
            >
              Siguiente
            </button>
          </div>
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={() => toast("Usá el menú + para seleccionar una acción")}
        onPickAction={handlePickAction}
        placeholder="Buscar movimiento o ingrediente..."
        helperText={null}
      />

      <ItemPanelLayout
        open={filtersOpen}
        title="Filtros"
        subtitle="Refiná la consulta del kardex"
        onClose={() => setFiltersOpen(false)}
      >
        {loading ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
            Cargando ingredientes...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Buscar ingrediente</p>
              <input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Buscar..."
                className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              />
              <select
                value={draftIngredientId}
                onChange={(e) => setDraftIngredientId(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                <option value="">Todos</option>
                {ingredients
                  .filter((ing) => {
                    const q = filterQuery.trim().toLowerCase();
                    if (!q) return true;
                    return ing.name.toLowerCase().includes(q);
                  })
                  .map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Desde</label>
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
                />
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Hasta</label>
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tipo de movimiento</p>
              <select
                value={draftMovementType}
                onChange={(e) => setDraftMovementType(e.target.value as any)}
                className="mt-2 w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
              >
                {movementTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setIngredientId(draftIngredientId);
                setFrom(draftFrom);
                setTo(draftTo);
                setMovementType(draftMovementType);
                setPage(1);
                router.replace(
                  draftIngredientId
                    ? `/inventario/kardex?ingredientId=${encodeURIComponent(draftIngredientId)}`
                    : "/inventario/kardex",
                );
                setFiltersOpen(false);
              }}
              className="h-12 w-full rounded-2xl bg-neutral-900 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition active:scale-[0.99]"
            >
              Aplicar filtros
            </button>
          </div>
        )}
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

export default function KardexPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
          <div className="shrink-0">
            <AppHeader title="Kardex" showBack hrefBack="/inventario" />
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto pb-44">
            <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
              <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-center text-sm text-neutral-400 shadow-sm">
                Cargando kardex...
              </div>
            </div>
          </main>
        </div>
      }
    >
      <KardexPageContent />
    </Suspense>
  );
}
