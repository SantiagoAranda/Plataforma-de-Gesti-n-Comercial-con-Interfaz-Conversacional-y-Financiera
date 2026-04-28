"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import { api } from "@/src/lib/api";
import { getErrorMessage } from "@/src/lib/errors";
import type { Item } from "@/src/types/item";
import type { Ingredient } from "@/src/services/inventory";
import {
  getRecipe,
  listIngredients,
  replaceRecipe,
  type RecipeLine,
} from "@/src/services/inventory";
import { cn } from "@/src/lib/utils";

type Props = {
  selectedItemId: string | null;
  onSelectItemId: (id: string | null) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  hideSearchInput?: boolean;
};

function parseNumber(value: string) {
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export function RecipeEditor({
  selectedItemId,
  onSelectItemId,
  searchValue,
  onSearchChange,
  hideSearchInput = false,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");

  const effectiveSearch = searchValue ?? internalSearch;

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const q = effectiveSearch.trim().toLowerCase();
    return items
      .filter((i) => i.type === "PRODUCT")
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, effectiveSearch]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [itemsRes, ingredientsRes] = await Promise.all([
          api<Item[]>(`/items?status=ACTIVE`),
          listIngredients({ status: "ACTIVE" }),
        ]);
        setItems(itemsRes);
        setIngredients(ingredientsRes);
      } catch (error) {
        console.error(error);
        toast.error(getErrorMessage(error, "No se pudo cargar productos/ingredientes"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedItemId) {
      setLines([]);
      return;
    }

    (async () => {
      try {
        setLoadingRecipe(true);
        const recipe = await getRecipe(selectedItemId);
        setLines(recipe ?? []);
      } catch (error) {
        console.error(error);
        toast.error(getErrorMessage(error, "No se pudo cargar la receta"));
        setLines([]);
      } finally {
        setLoadingRecipe(false);
      }
    })();
  }, [selectedItemId]);

  const ingredientName = (ingredientId: string) =>
    ingredients.find((i) => i.id === ingredientId)?.name ?? "Ingrediente";

  const validateBeforeSave = () => {
    if (!selectedItem) return "Selecciona un producto";
    if (selectedItem.type === "SERVICE") return "Los servicios no pueden tener recetas";
    if (selectedItem.inventoryMode === "NONE") return "Este producto no usa inventario (modo NONE)";

    const mandatory = lines.filter((l) => !l.isOptional);
    if (selectedItem.inventoryMode === "SIMPLE") {
      if (mandatory.length !== 1) return "SIMPLE debe tener exactamente 1 línea obligatoria";
      if (lines.length !== 1) return "SIMPLE no puede tener líneas opcionales";
    }
    if (selectedItem.inventoryMode === "RECIPE_BASED" && mandatory.length < 1) {
      return "RECIPE_BASED debe tener al menos 1 línea obligatoria";
    }

    for (const line of lines) {
      if (!line.ingredientId) return "Cada línea debe tener ingrediente";
      if (!Number.isFinite(line.quantityRequired) || line.quantityRequired <= 0) {
        return "quantityRequired debe ser mayor a 0";
      }
    }

    const ids = lines.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length) return "La receta contiene ingredientes duplicados";

    return null;
  };

  const save = async () => {
    const errorText = validateBeforeSave();
    if (errorText) {
      toast.error(errorText);
      return;
    }

    if (!selectedItemId) return;
    const loadingId = "recipe-save-loading";
    const successId = "recipe-save-success";
    const errorId = "recipe-save-error";

    try {
      setSubmitting(true);
      toast.dismiss(errorId);
      toast.dismiss(successId);
      toast.loading("Guardando receta...", { id: loadingId });

      const payload = {
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantityRequired: l.quantityRequired,
          isOptional: !!l.isOptional,
        })),
      };

      const updated = await replaceRecipe(selectedItemId, payload);
      setLines(updated ?? payload.lines);

      toast.dismiss(loadingId);
      toast.success("Receta guardada", { id: successId, duration: 2200 });
    } catch (error) {
      console.error(error);
      toast.dismiss(loadingId);
      toast.error(getErrorMessage(error, "No se pudo guardar la receta"), { id: errorId, duration: 4500 });
    } finally {
      setSubmitting(false);
    }
  };

  const selectorCard = (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Producto</p>

      <div className="mt-3 space-y-2">
        {!hideSearchInput && (
          <input
            value={effectiveSearch}
            onChange={(e) => {
              onSearchChange?.(e.target.value);
              if (!onSearchChange) setInternalSearch(e.target.value);
            }}
            placeholder="Buscar producto..."
            className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
          />
        )}

        <select
          value={selectedItemId ?? ""}
          onChange={(e) => onSelectItemId(e.target.value || null)}
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
        >
          <option value="">Seleccionar...</option>
          {filteredItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.inventoryMode ? ` (${item.inventoryMode})` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedItem && (
        <div className="mt-3 rounded-2xl bg-neutral-50 px-4 py-3 text-[11px] font-medium text-neutral-600">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-neutral-800">{selectedItem.name}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-500 ring-1 ring-black/5">
              {selectedItem.type}
            </span>
          </div>
          <p className="mt-1 text-neutral-500">
            Modo inventario:{" "}
            <span className="font-bold">{selectedItem.inventoryMode ?? "desconocido"}</span>
          </p>
        </div>
      )}
    </div>
  );

  const recipeCard = selectedItemId ? (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Receta</p>
          <p className="mt-1 text-sm font-bold text-neutral-900">Líneas: {lines.length}</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { ingredientId: ingredients[0]?.id ?? "", quantityRequired: 1, isOptional: false },
            ])
          }
          className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700 active:scale-95"
          aria-label="Agregar línea"
          disabled={!ingredients.length}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {loadingRecipe ? (
        <div className="mt-4 text-center text-neutral-400">Cargando receta...</div>
      ) : (
        <div className="mt-4 space-y-3">
          {lines.map((line, idx) => (
            <div key={`${line.ingredientId}:${idx}`} className="rounded-2xl border border-neutral-100 bg-white p-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Ingrediente</p>
                  <select
                    value={line.ingredientId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, ingredientId: e.target.value } : l)),
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-100 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
                  >
                    <option value="">Seleccionar...</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name}
                      </option>
                    ))}
                  </select>
                  {line.ingredientId && (
                    <p className="mt-1 text-[11px] font-medium text-neutral-400">
                      {ingredientName(line.ingredientId)}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Cantidad</p>
                  <input
                    value={String(line.quantityRequired ?? "")}
                    onChange={(e) => {
                      const num = parseNumber(e.target.value);
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, quantityRequired: num } : l)),
                      );
                    }}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-neutral-100 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, isOptional: !l.isOptional } : l)),
                    )
                  }
                  className={cn(
                    "h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-widest transition",
                    line.isOptional ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
                  )}
                >
                  {line.isOptional ? "Opcional" : "Obligatorio"}
                </button>

                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-600 active:scale-95"
                  aria-label="Eliminar línea"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {!lines.length && (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
              Sin receta. Agrega una línea para comenzar.
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!selectedItemId || submitting}
        className="mt-5 h-12 w-full rounded-2xl bg-neutral-900 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "Guardando..." : "Guardar receta"}
      </button>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center text-neutral-400">
      Selecciona un producto para editar su receta.
    </div>
  );

  if (loading) {
    return <div className="p-6 text-center text-neutral-400">Cargando...</div>;
  }

  return <div className="flex flex-col-reverse gap-4">{recipeCard}{selectorCard}</div>;
}

