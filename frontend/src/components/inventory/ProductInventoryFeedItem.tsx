"use client";

import { cn } from "@/src/lib/utils";
import type { ComposedProduct } from "./types";
import { formatMoney } from "@/src/lib/formatters";
import { parseNumber } from "./inventoryUtils";

type Props = {
  product: ComposedProduct;
  selected?: boolean;
  onClick: () => void;
};

function getTypeBadge(type: string) {
  if (type === "SERVICE") {
    return { label: "Servicio", tone: "bg-violet-50 text-violet-700" };
  }
  return { label: "Producto", tone: "bg-neutral-100 text-neutral-600" };
}

function getModeBadge(mode: string) {
  if (mode === "SIMPLE") {
    return { label: "Stock simple", tone: "bg-sky-50 text-sky-700" };
  }
  if (mode === "RECIPE_BASED") {
    return { label: "Producto compuesto", tone: "bg-amber-50 text-amber-800" };
  }
  if (mode === "NONE") {
    return { label: "Sin control", tone: "bg-neutral-100 text-neutral-600" };
  }
  return { label: mode, tone: "bg-neutral-100 text-neutral-600" };
}

function recipeStatus(product: ComposedProduct) {
  if (product.itemType === "SERVICE") {
    return { ok: true, label: "No impacta inventario", tone: "bg-neutral-100 text-neutral-600" };
  }
  if (product.inventoryMode === "NONE") {
    return { ok: true, label: "No descuenta stock", tone: "bg-neutral-100 text-neutral-600" };
  }

  const mandatory = product.ingredients.filter((l) => !l.isOptional);

  const anyInvalidLine = product.ingredients.some(
    (l) => !l.ingredientId || !Number.isFinite(l.quantityRequired) || l.quantityRequired <= 0,
  );

  if (product.inventoryMode === "SIMPLE") {
    if (mandatory.length === 0) {
      return { ok: false, label: "Sin receta", tone: "bg-rose-50 text-rose-700" };
    }
    const ok = mandatory.length === 1 && product.ingredients.length === 1 && !anyInvalidLine;
    return ok
      ? { ok: true, label: "Receta configurada", tone: "bg-emerald-50 text-emerald-800" }
      : { ok: false, label: "Receta inválida", tone: "bg-rose-50 text-rose-700" };
  }

  if (product.inventoryMode === "RECIPE_BASED") {
    if (mandatory.length === 0) {
      return { ok: false, label: "Sin receta", tone: "bg-rose-50 text-rose-700" };
    }
    const ok = mandatory.length >= 1 && !anyInvalidLine;
    return ok
      ? { ok: true, label: "Receta configurada", tone: "bg-emerald-50 text-emerald-800" }
      : { ok: false, label: "Receta inválida", tone: "bg-rose-50 text-rose-700" };
  }

  return { ok: true, label: "Listo", tone: "bg-neutral-100 text-neutral-600" };
}

export function ProductInventoryFeedItem({ product, selected, onClick }: Props) {
  const formatValue = (val?: number | string) => {
    if (val === undefined || val === null) return null;
    const num = parseNumber(String(val));
    return Number.isFinite(num) ? num : null;
  };

  const stock = formatValue(product.stock);
  const value = formatValue(product.value);
  const typeBadge = getTypeBadge(product.itemType);
  const mode = getModeBadge(product.inventoryMode);
  const status = recipeStatus(product);

  const isInventoriableProduct =
    product.itemType === "PRODUCT" &&
    (product.inventoryMode === "SIMPLE" || product.inventoryMode === "RECIPE_BASED");

  const canShowIngredients = isInventoriableProduct && product.ingredients.length > 0;
  const shouldShowNoRecipe = isInventoriableProduct && product.ingredients.length === 0;

  const mandatoryLines = product.ingredients.filter((l) => !l.isOptional);

  const producibleUnits = (() => {
    if (!isInventoriableProduct) return null;
    if (product.inventoryMode !== "RECIPE_BASED") return null;
    if (mandatoryLines.length === 0) return null;

    let minUnits = Number.POSITIVE_INFINITY;
    for (const line of mandatoryLines) {
      const stock = parseNumber(line.currentStock ?? 0);
      const required = parseNumber(line.quantityRequired);
      if (!Number.isFinite(stock) || !Number.isFinite(required) || required <= 0) return null;
      minUnits = Math.min(minUnits, Math.floor(stock / required));
    }

    return Number.isFinite(minUnits) ? minUnits : null;
  })();

  const simpleStockInfo = (() => {
    if (!isInventoriableProduct) return null;
    if (product.inventoryMode !== "SIMPLE") return null;
    if (mandatoryLines.length !== 1 || product.ingredients.length !== 1) return null;

    const line = mandatoryLines[0];
    const stock = parseNumber(line.currentStock ?? 0);
    if (!Number.isFinite(stock)) return null;
    return { stock, unit: line.consumptionUnit ?? "" };
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3xl p-4 text-left shadow-sm transition active:scale-[0.99] border",
        selected
          ? "bg-emerald-50/60 border-emerald-200 ring-1 ring-emerald-200"
          : "bg-white/90 border-neutral-200 ring-0 hover:bg-white",
      )}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-bold text-neutral-900",
            )}
          >
            {product.itemName}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                selected ? "bg-emerald-200/50 text-emerald-900" : typeBadge.tone,
              )}
            >
              {typeBadge.label}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                selected ? "bg-emerald-200/50 text-emerald-900" : mode.tone,
              )}
            >
              {mode.label}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                selected ? "bg-white/70 text-neutral-700" : status.tone,
              )}
            >
              {status.label}
            </span>
          </div>
        </div>

        {(stock !== null || value !== null) && (
          <div className="shrink-0 text-right">
            {stock !== null && (
              <p className="text-xs font-bold text-emerald-600">
                Stock: {stock}
              </p>
            )}
            {value !== null && (
              <p className="text-[10px] font-medium text-neutral-400">
                ${formatMoney(value)}
              </p>
            )}
          </div>
        )}
      </div>

      {canShowIngredients && (
        <div
          className={cn(
            "mt-1 rounded-2xl p-2",
            selected ? "bg-white/60" : "bg-neutral-50",
          )}
        >
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Ingredientes ({product.ingredients.length})
          </p>
          <div className="space-y-1">
            {product.ingredients.slice(0, 3).map((ing) => (
              <div
                key={ing.ingredientId}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-neutral-600">
                  {ing.name}
                  {ing.isOptional && " (Opc)"}
                </span>
                <span className="shrink-0 font-medium text-neutral-500">
                  {ing.quantityRequired} {ing.consumptionUnit}
                </span>
              </div>
            ))}
            {product.ingredients.length > 3 && (
              <p className="text-[10px] font-medium text-neutral-400">
                +{product.ingredients.length - 3} más
              </p>
            )}
          </div>
        </div>
      )}

      {shouldShowNoRecipe && (
        <p className="mt-1 text-[11px] font-medium text-neutral-400">
          Sin receta configurada
        </p>
      )}

      {product.itemType === "PRODUCT" && product.inventoryMode === "NONE" && (
        <p className="mt-1 text-[11px] font-medium text-neutral-400">
          Activar control desde Mi Negocio.
        </p>
      )}

      {product.itemType === "SERVICE" && (
        <p className="mt-1 text-[11px] font-medium text-neutral-400">
          Los servicios no descuentan inventario.
        </p>
      )}

      {isInventoriableProduct && producibleUnits !== null && producibleUnits >= 0 && (
        <p className="mt-1 text-[11px] font-medium text-neutral-500">
          Puede producirse aprox.:{" "}
          <span className="font-black text-neutral-700">{producibleUnits}</span> unidades
        </p>
      )}

      {isInventoriableProduct && simpleStockInfo !== null && (
        <p className="mt-1 text-[11px] font-medium text-neutral-500">
          Stock disponible:{" "}
          <span className="font-black text-neutral-700">
            {simpleStockInfo.stock} {simpleStockInfo.unit}
          </span>
        </p>
      )}

      {isInventoriableProduct && (
        <p className={cn("mt-1 text-[11px] font-bold", selected ? "text-neutral-700" : "text-neutral-400")}>
          Editar receta →
        </p>
      )}
    </button>
  );
}
