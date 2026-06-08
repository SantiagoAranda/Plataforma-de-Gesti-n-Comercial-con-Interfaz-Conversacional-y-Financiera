"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import type { InventoryChatMenuAction } from "@/src/components/inventory/InventoryChatActionBar";

type Options = {
  onIngredients?: () => void;
  onKardex?: () => void;
  onRecipes?: () => void;
  onPurchaseReturn?: () => void;
};

export function useInventoryNavigation(options: Options = {}) {
  const router = useRouter();
  const { onIngredients, onKardex, onRecipes, onPurchaseReturn } = options;

  return useCallback(
    (action: InventoryChatMenuAction) => {
      if (action === "INGREDIENTES") {
        if (onIngredients) return onIngredients();
        router.push("/inventario/ingredientes");
        return;
      }

      if (action === "KARDEX") {
        if (onKardex) return onKardex();
        router.push("/inventario/kardex");
        return;
      }

      if (action === "RECETAS") {
        if (onRecipes) return onRecipes();
        router.push("/inventario/recetas");
        return;
      }

      if (action === "REGISTER_PURCHASE_RETURN") {
        onPurchaseReturn?.();
      }
    },
    [onIngredients, onKardex, onPurchaseReturn, onRecipes, router],
  );
}
