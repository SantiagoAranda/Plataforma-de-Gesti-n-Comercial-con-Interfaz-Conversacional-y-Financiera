"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { IngredientForm } from "@/src/components/inventory/IngredientForm";
import { createIngredient } from "@/src/services/inventory";
import { getErrorMessage } from "@/src/lib/errors";

export default function NuevoIngredientePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Nuevo ingrediente" showBack hrefBack="/inventario/ingredientes" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <IngredientForm
              mode="create"
              submitting={submitting}
              onSubmit={async (values) => {
                const loadingId = "ingredient-create-loading";
                try {
                  setSubmitting(true);
                  toast.loading("Creando ingrediente...", { id: loadingId });
                  const created = await createIngredient({
                    name: values.name,
                    consumptionUnit: values.consumptionUnit,
                    purchaseUnit: values.purchaseUnit,
                    purchaseToConsumptionFactor: values.purchaseToConsumptionFactor,
                  });
                  toast.dismiss(loadingId);
                  toast.success("Ingrediente creado");
                  router.replace(`/inventario/ingredientes/${created.id}`);
                } catch (err) {
                  console.error(err);
                  toast.dismiss(loadingId);
                  toast.error(getErrorMessage(err, "No se pudo crear el ingrediente"));
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

