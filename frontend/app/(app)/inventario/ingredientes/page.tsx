"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { cn } from "@/src/lib/utils";
import { getErrorMessage } from "@/src/lib/errors";
import { getInventorySummary, type InventorySummaryIngredient, type IngredientStatus } from "@/src/services/inventory";
import { IngredientList } from "@/src/components/inventory/IngredientList";

export default function IngredientesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IngredientStatus>("ACTIVE");
  const [search, setSearch] = useState("");
  const [ingredients, setIngredients] = useState<InventorySummaryIngredient[]>([]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, search]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Ingredientes" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Gesti&oacute;n
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-900">
                  Crea, edita y desactiva ingredientes
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/inventario/ingredientes/nuevo")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 active:scale-95"
                aria-label="Crear ingrediente"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-neutral-100 bg-white px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 text-neutral-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ingrediente..."
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
            </div>

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
              ingredients={filtered}
              onSelect={(id) => router.push(`/inventario/ingredientes/${id}`)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

