"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ClipboardList, PackageSearch } from "lucide-react";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { getErrorMessage } from "@/src/lib/errors";
import { getInventorySummary, type InventorySummaryIngredient } from "@/src/services/inventory";
import { InventorySummaryCards } from "@/src/components/inventory/InventorySummaryCards";
import { IngredientList } from "@/src/components/inventory/IngredientList";

export default function InventarioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<InventorySummaryIngredient[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const previewIngredients = useMemo(() => summary.slice(0, 12), [summary]);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Inventario" showBack hrefBack="/home" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
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

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/inventario/ingredientes")}
                  className="flex min-h-[74px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]"
                >
                  <ClipboardList className="h-5 w-5 text-neutral-700" />
                  <p className="mt-2 text-xs font-black text-neutral-900">Ingredientes</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    CRUD
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/inventario/kardex")}
                  className="flex min-h-[74px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]"
                >
                  <PackageSearch className="h-5 w-5 text-neutral-700" />
                  <p className="mt-2 text-xs font-black text-neutral-900">Kardex</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Movimientos
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/inventario/recetas")}
                  className="flex min-h-[74px] flex-col items-start justify-center rounded-2xl bg-white px-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]"
                >
                  <BookOpen className="h-5 w-5 text-neutral-700" />
                  <p className="mt-2 text-xs font-black text-neutral-900">Recetas</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Por producto
                  </p>
                </button>
              </div>

              <div className="pt-2">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900">Ingredientes</h2>
                  <button
                    type="button"
                    onClick={() => router.push("/inventario/ingredientes")}
                    className="text-[10px] font-black uppercase tracking-widest text-neutral-400"
                  >
                    Ver todos
                  </button>
                </div>
                <IngredientList
                  ingredients={previewIngredients}
                  onSelect={(id) => router.push(`/inventario/ingredientes/${id}`)}
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

