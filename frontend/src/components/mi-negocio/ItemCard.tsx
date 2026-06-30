"use client";

import { memo, useState } from "react";
import { api } from "@/src/lib/api";
import { getCached } from "@/src/lib/cache";

import { SelectableCard } from "@/src/components/shared/selection/SelectableCard";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney, truncateText } from "@/src/lib/formatters";
import { formatCompactDate } from "@/src/lib/datetime";

import { useRouter } from "next/navigation";
import { MoreVertical, Eye, Pencil, Settings, Trash2 } from "lucide-react";
import { formatActiveDaysCompact } from "@/src/lib/availability";

type Props = {
  item: any;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  recipeLineCount?: number;
};

function inventoryMeta(item: any, recipeLineCount = 0) {
  const status = item.sellability?.status;
  if (status) {
    const map: Record<string, { label: string; tone: string }> = {
      SELLABLE: { label: "Listo para vender", tone: "bg-emerald-50 text-emerald-800" },
      LOW_STOCK: { label: "Stock bajo", tone: "bg-amber-50 text-amber-800" },
      NO_STOCK: { label: "Sin stock", tone: "bg-rose-50 text-rose-700" },
      MISSING_INITIAL_STOCK: { label: "Sin inventario inicial", tone: "bg-rose-50 text-rose-700" },
      MISSING_RECIPE: { label: "Receta incompleta", tone: "bg-amber-50 text-amber-800" },
      EMPTY_RECIPE: { label: "Receta sin ingredientes", tone: "bg-amber-50 text-amber-800" },
      INSUFFICIENT_RECIPE_STOCK: { label: "Stock insuficiente para receta", tone: "bg-rose-50 text-rose-700" },
      INACTIVE: { label: "Inactivo", tone: "bg-neutral-100 text-neutral-600" },
    };
    return map[status] ?? { label: "Revisar inventario", tone: "bg-amber-50 text-amber-800" };
  }

  if (item.type !== "PRODUCT" || item.inventoryMode === "NONE" || !item.inventoryMode) {
    return { label: "Sin inventario", tone: "bg-neutral-100 text-neutral-600" };
  }
  if (item.inventoryMode === "SIMPLE") {
    return { label: "Stock simple", tone: "bg-emerald-50 text-emerald-800" };
  }
  const configured = recipeLineCount > 0;
  return {
    label: configured ? "Receta configurada" : "Receta pendiente",
    tone: configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800",
  };
}

function ItemCardComponent({ item, onEdit, onDelete, onView, recipeLineCount = 0 }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hydratedImages, setHydratedImages] = useState<any[] | null>(null);
  const currentImages = hydratedImages ?? item.images ?? [];
  const imageCount = item._count?.images ?? currentImages.length;

  const activeDays = item.type === "SERVICE" ? formatActiveDaysCompact(item.schedule) : "";
  const inventory = inventoryMeta(item, recipeLineCount);

  const inventoryAction = (() => {
    if (
      item.type !== "PRODUCT" ||
      !item.inventoryMode ||
      item.inventoryMode === "NONE"
    ) {
      return null;
    }

    if (item.inventoryMode === "SIMPLE") {
      return {
        label: "Gestionar stock",
        url: "/inventario?tab=insumos",
      };
    }

    return {
      label: "Configurar receta",
      url: `/inventario?tab=recipes&itemId=${encodeURIComponent(item.id)}`,
    };
  })();

  return (
    <div className="relative group select-none">
      <SelectableCard
        onSelect={() => {}}
        disableOpenOnClick={true}
        disableLongPress={true}
        className="relative select-none ml-auto max-w-[85%] lg:max-w-[460px] overflow-hidden flex flex-col min-h-[140px]"
      >
        {/* Botón de 3 puntitos como nuevo gatillador */}
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsOpen(!isOpen);
            }}
            className="p-1.5 bg-white/80 backdrop-blur-sm hover:bg-neutral-100 rounded-full text-neutral-600 transition-colors duration-200 shadow-sm border border-neutral-100"
            aria-label="Opciones de producto"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Dropdown absoluto local corregido estéticamente */}
          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsOpen(false);
                }}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-100 rounded-xl shadow-xl py-1.5 z-50 text-xs text-neutral-700 font-medium animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onView();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors flex items-center gap-2.5 text-neutral-800"
                >
                  <Eye className="w-3.5 h-3.5 text-neutral-400" />
                  Ver detalle
                </button>
                
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onEdit();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors flex items-center gap-2.5 text-neutral-800"
                >
                  <Pencil className="w-3.5 h-3.5 text-neutral-400" />
                  Editar item
                </button>

                {inventoryAction && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      router.push(inventoryAction.url);
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors flex items-center gap-2.5 text-neutral-800"
                  >
                    <Settings className="w-3.5 h-3.5 text-neutral-400" />
                    {inventoryAction.label}
                  </button>
                )}

                {/* Línea divisoria sutil antes de una acción crítica como borrar */}
                <div className="border-t border-neutral-100 my-1" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDelete();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-rose-600 hover:bg-rose-50/60 transition-colors flex items-center gap-2.5 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  Eliminar
                </button>
              </div>
            </>
          )}
        </div>

        {(currentImages.length > 0) && (
          <div className="aspect-[4/3] w-full overflow-hidden border-b border-neutral-100 bg-neutral-50 shrink-0 lg:aspect-auto lg:h-[220px]">
            <ItemImageViewer
              images={currentImages}
              imageCount={imageCount}
              onLoadGallery={async () => {
                if (currentImages.length < imageCount) {
                  try {
                    const res = await getCached(`item-detail:${item.id}`, 60000, () => api<any>(`/items/${item.id}`));
                    if (res?.images) setHydratedImages(res.images);
                  } catch (e) {}
                }
              }}
              name={item.name}
              containerClassName="h-full w-full flex items-center justify-center"
              imageClassName="h-full w-full object-cover pointer-events-none select-none"
              lazy
            />
          </div>
        )}

        <div className="px-4 py-3 flex-1 flex flex-col gap-1.5">
          {/* HEADER: NOMBRE + PRECIO */}
          <div className="flex justify-between items-start gap-2 pr-8">
            <p className="text-sm font-semibold text-neutral-900 flex-1 line-clamp-1">
              {item.name}
            </p>
            <p className="text-emerald-600 font-medium text-sm whitespace-nowrap">
              ${formatMoney(item.price)}
            </p>
          </div>

          {/* DURATION (IF SERVICE) */}
          {item.type === "SERVICE" && (
            <div className="flex items-center justify-between gap-1.5 w-full text-[10px] font-medium">
              <div className="flex items-center gap-1.5 text-neutral-500">
                <span>🕒</span>
                <span>{item.durationMinutes ? `${item.durationMinutes / 60} h` : "0 h"}</span>
              </div>
              {activeDays && (
                <span className="text-neutral-700 font-semibold italic">
                  {activeDays}
                </span>
              )}
            </div>
          )}

          {/* DESCRIPTION */}
          <div className="flex-1">
            {item.description && (
              <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2">
                {truncateText(item.description, 90)}
              </p>
            )}
          </div>

          {/* FOOTER: PILL LEFT, DATE RIGHT */}
          <div className="mt-auto pt-2 flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${inventory.tone}`}>
                {inventory.label}
              </span>
            </div>

            <span className="text-[9px] text-neutral-400 font-medium tabular-nums lowercase italic whitespace-nowrap ml-auto">
              {formatCompactDate(item.createdAt)}
            </span>
          </div>
        </div>
      </SelectableCard>
    </div>
  );
}

export const ItemCard = memo(ItemCardComponent, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.price === next.item.price &&
    prev.item.type === next.item.type &&
    prev.item.durationMinutes === next.item.durationMinutes &&
    prev.item.description === next.item.description &&
    prev.item.inventoryMode === next.item.inventoryMode &&
    prev.recipeLineCount === next.recipeLineCount &&
    prev.item._count?.images === next.item._count?.images &&
    prev.item.images?.[0]?.url === next.item.images?.[0]?.url
  );
});
