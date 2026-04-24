"use client";

import { useState } from "react";

import AppHeader from "@/src/components/layout/AppHeader";
import { RecipeEditor } from "@/src/components/inventory/RecipeEditor";

export default function RecetasPage() {
  const [itemId, setItemId] = useState<string | null>(null);

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader title="Recetas" showBack hrefBack="/inventario" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
          <RecipeEditor selectedItemId={itemId} onSelectItemId={setItemId} />
        </div>
      </main>
    </div>
  );
}

