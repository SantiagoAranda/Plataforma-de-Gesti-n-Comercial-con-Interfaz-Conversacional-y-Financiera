"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { getErrorMessage } from "@/src/lib/errors";
import { getIngredient, updateIngredient, type Ingredient } from "@/src/services/inventory";

export default function EditarIngredientePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const ingredientId = params.id;

  const [loading, setLoading] = useState(true);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Editar ingrediente" showBack hrefBack={`/inventario/ingredientes/${ingredientId}`} />
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
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <IngredientForm
                mode="edit"
                initial={ingredient}
                submitting={submitting}
                onSubmit={async (values) => {
                  const loadingId = "ingredient-update-loading";
                  try {
                    setSubmitting(true);
                    toast.loading("Guardando...", { id: loadingId });
                    const updated = await updateIngredient(ingredientId, {
                      name: values.name,
                      consumptionUnit: values.consumptionUnit,
                      purchaseUnit: values.purchaseUnit,
                      purchaseToConsumptionFactor: values.purchaseToConsumptionFactor,
                      status: values.status,
                    });
                    toast.dismiss(loadingId);
                    toast.success("Ingrediente actualizado");
                    router.replace(`/inventario/ingredientes/${updated.id}`);
                  } catch (err) {
                    console.error(err);
                    toast.dismiss(loadingId);
                    toast.error(getErrorMessage(err, "No se pudo actualizar"));
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

