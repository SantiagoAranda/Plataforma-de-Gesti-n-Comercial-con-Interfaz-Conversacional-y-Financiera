"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import AppHeader from "@/src/components/layout/AppHeader";
import { RecipeEditor } from "@/src/components/inventory/RecipeEditor";
import {
  InventoryChatActionBar,
  type InventoryChatMenuAction,
} from "@/src/components/inventory/InventoryChatActionBar";
import { ItemPanelLayout } from "@/src/components/mi-negocio/ItemPanelLayout";

export default function RecetasPage() {
  const router = useRouter();
  const [itemId, setItemId] = useState<string | null>(null);
  const [chatValue, setChatValue] = useState("");
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);

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
        <AppHeader title="Recetas" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-44">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <RecipeEditor
            selectedItemId={itemId}
            onSelectItemId={setItemId}
            searchValue={chatValue}
            onSearchChange={setChatValue}
            hideSearchInput
          />
        </div>
      </main>

      <InventoryChatActionBar
        value={chatValue}
        onChange={setChatValue}
        onSubmit={() => toast("Us\u00E1 el men\u00FA + para seleccionar una acci\u00F3n")}
        onPickAction={handlePickAction}
        placeholder="Buscar producto o receta..."
        helperText="Escrib\u00ED para filtrar. Us\u00E1 el + para navegar."
      />

      <ItemPanelLayout
        open={purchaseReturnOpen}
        title="Devoluci\u00F3n de compras"
        subtitle="Pr\u00F3ximamente"
        onClose={() => setPurchaseReturnOpen(false)}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm font-medium text-neutral-700 shadow-sm">
          Devoluci\u00F3n de compras estar\u00E1 disponible pr\u00F3ximamente
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

