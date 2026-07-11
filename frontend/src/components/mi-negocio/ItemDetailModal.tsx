"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Tag, Clock, Calendar } from "lucide-react";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney } from "@/src/lib/formatters";
import { formatFullDate } from "@/src/lib/datetime";
import { api } from "@/src/lib/api";

import { groupScheduleByDay, formatActiveDaysCompact } from "@/src/lib/availability";
import { getItemBadges, getContrastColor } from "@/src/lib/itemBadges";

import { ItemPanelLayout } from "./ItemPanelLayout";

interface Item {
  id: string;
  name: string;
  price: number;
  description?: string;
  type?: "PRODUCT" | "SERVICE";
  durationMinutes?: number;
  schedule?: any[];
  createdAt?: string;
  badges?: Array<{ text: string; color: string }> | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  images?: { id: string; url: string; order: number }[];
  status?: string;
  inventoryMode?: "NONE" | "SIMPLE" | "RECIPE_BASED" | null;
  sellability?: {
    sellable: boolean;
    status: string;
    message?: string;
  };
}

interface ItemDetailModalProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
  recipeLineCount?: number;
}

function inventoryMeta(item: Item, recipeLineCount = 0) {
  if (item.sellability?.status) {
    const map: Record<string, { label: string; tone: string; cta: null | string; href: null | string }> = {
      SELLABLE: { label: "Listo para vender", tone: "bg-emerald-50 text-emerald-800", cta: null, href: null },
      LOW_STOCK: { label: "Stock bajo", tone: "bg-amber-50 text-amber-800", cta: "Cargar stock", href: "/inventario?tab=products" },
      NO_STOCK: { label: "Sin stock", tone: "bg-rose-50 text-rose-700", cta: "Cargar stock", href: "/inventario?tab=products" },
      MISSING_INITIAL_STOCK: { label: "Sin inventario inicial", tone: "bg-rose-50 text-rose-700", cta: "Cargar stock", href: "/inventario?tab=products" },
      MISSING_RECIPE: { label: "Receta incompleta", tone: "bg-amber-50 text-amber-800", cta: "Configurar receta", href: `/inventario?tab=recipes&itemId=${encodeURIComponent(item.id)}` },
      EMPTY_RECIPE: { label: "Receta sin ingredientes", tone: "bg-amber-50 text-amber-800", cta: "Configurar receta", href: `/inventario?tab=recipes&itemId=${encodeURIComponent(item.id)}` },
      INSUFFICIENT_RECIPE_STOCK: { label: "Stock insuficiente para receta", tone: "bg-rose-50 text-rose-700", cta: "Revisar insumos", href: "/inventario?tab=insumos" },
      INACTIVE: { label: "Inactivo", tone: "bg-neutral-100 text-neutral-600", cta: null, href: null },
    };
    return map[item.sellability.status] ?? { label: "Revisar inventario", tone: "bg-amber-50 text-amber-800", cta: null, href: null };
  }

  if (item.type !== "PRODUCT" || item.inventoryMode === "NONE" || !item.inventoryMode) {
    return { label: "Sin inventario", tone: "bg-neutral-100 text-neutral-600", cta: null as null | string, href: null as null | string };
  }
  if (item.inventoryMode === "SIMPLE") {
    return { label: "Stock simple", tone: "bg-emerald-50 text-emerald-800", cta: "Cargar stock", href: "/inventario?tab=insumos" };
  }
  const configured = recipeLineCount > 0;
  return {
    label: configured ? "Receta configurada" : "Receta pendiente",
    tone: configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800",
    cta: "Configurar receta",
    href: `/inventario?tab=recipes&itemId=${encodeURIComponent(item.id)}`,
  };
}

type QuantityMode = "FIXED_PER_OPTION" | "SHARED_TOTAL" | "NO_QUANTITY";
type TargetType = "NONE" | "INGREDIENT" | "ITEM";

type OptionGroup = {
  id: string;
  title: string;
  description?: string | null;
  required: boolean;
  minSelections: number;
  maxSelections?: number | null;
  quantityMode: QuantityMode;
  totalQuantityLimit?: number | null;
  totalQuantityUnitId?: string | null;
  sortOrder: number;
  isActive: boolean;
  options: Array<{
    id: string;
    name: string;
    targetType: TargetType;
    priceDelta: number;
    selectedByDefault: boolean;
    removable: boolean;
    isActive: boolean;
  }>;
};

type UnitOption = { id: string; name: string; symbol: string; kind: string };
type IngredientOption = { id: string; name: string; stockUnitId?: string | null };
type ItemOptionTarget = { id: string; name: string; inventoryMode?: string | null; type?: string };



export default function ItemDetailModal({ item, open, onClose, onEdit, onDelete, recipeLineCount = 0 }: ItemDetailModalProps) {
  const router = useRouter();
  const [fullItem, setFullItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item?.id && item.type === "SERVICE") {
      if (!item.schedule || item.schedule.length === 0) {
        setLoading(true);
        api<Item>(`/items/${item.id}`)
          .then(res => setFullItem(res))
          .catch(() => {})
          .finally(() => setLoading(false));
      } else {
        setFullItem(null);
      }
    } else {
      setFullItem(null);
      setLoading(false);
    }
  }, [open, item?.id, item?.type, item?.schedule]);

  if (!open || !item) return null;

  const displayItem = fullItem ?? item;
  const images = displayItem.images ?? [];
  const imageCount = images.length;
  const badges = getItemBadges(displayItem);
  
  const activeDays = displayItem.type === "SERVICE" ? formatActiveDaysCompact(displayItem.schedule) : "";
  const groupedSchedule = displayItem.type === "SERVICE" ? groupScheduleByDay(displayItem.schedule) : [];
  const inventory = inventoryMeta(displayItem, recipeLineCount);

  // ─── ACTION FOOTER ────────────────────────────────────────────────────────
  // Rendered via the `footer` prop of ItemPanelLayout, which places it in a
  // `sticky bottom-0` zone that is completely outside the scrollable content
  // area. This guarantees the buttons are always anchored at the bottom,
  // regardless of whether a product image is present or not.
  const actionFooter = (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onEdit(displayItem)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition active:scale-[0.99] hover:bg-neutral-800"
      >
        <Edit size={14} />
        <span>{displayItem.type === "PRODUCT" ? "Editar Producto" : "Editar Servicio"}</span>
      </button>

      <button
        type="button"
        onClick={() => onDelete(displayItem)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 text-xs font-bold uppercase tracking-widest text-rose-600 shadow-sm transition active:scale-[0.99] hover:bg-rose-100"
      >
        <Trash2 size={14} />
        <span>{displayItem.type === "PRODUCT" ? "Eliminar Producto" : "Eliminar Servicio"}</span>
      </button>
    </div>
  );

  return (
    <ItemPanelLayout
      open={open}
      onClose={onClose}
      title="Detalle"
      subtitle={`#${displayItem.id.slice(-6).toUpperCase()}`}
      footer={actionFooter}
    >
      <div className="space-y-6">

        {/* IMAGE SECTION */}
        {imageCount > 0 ? (
          <div className="relative rounded-2xl overflow-hidden border border-neutral-100 bg-white shadow-sm aspect-square w-full">
            <ItemImageViewer
              images={images}
              imageCount={imageCount}
              name={item.name}
              containerClassName="h-full w-full flex items-center justify-center"
              imageClassName="h-full w-full object-cover"
            />
            {badges.length ? (
              <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
                {badges.map((badge) => (
                  <div
                    key={`${badge.text}-${badge.color}`}
                    className="rounded-xl px-3 py-1 text-[8px] font-semibold uppercase"
                    style={{ background: badge.color, color: getContrastColor(badge.color) }}
                  >
                    {badge.text}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 py-10 w-full flex flex-col items-center justify-center text-neutral-400 gap-2">
            <Tag size={32} strokeWidth={1.5} />
            <p className="text-[10px] font-medium uppercase tracking-widest">Sin imágenes</p>
          </div>
        )}

        {/* MAIN INFO GRID */}
        <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-4">
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Nombre</span>
            <h3 className="text-base font-medium text-neutral-900">{item.name}</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-50">
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Precio</span>
              <span className="text-lg font-semibold text-emerald-600">${formatMoney(item.price)}</span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Inventario</span>
              <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${inventory.tone}`}>
                {inventory.label}
              </span>
            </div>
          </div>

          {displayItem.sellability?.message && !displayItem.sellability.sellable ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Este producto no aparece en ventas ni tienda pública porque {displayItem.sellability.message.charAt(0).toLowerCase() + displayItem.sellability.message.slice(1)}
            </div>
          ) : null}

          {inventory.cta && inventory.href ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(inventory.href!);
              }}
              className="h-11 w-full rounded-2xl bg-neutral-900 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition active:scale-[0.99]"
            >
              {inventory.cta}
            </button>
          ) : null}
        </div>

        {/* ESTIMATED DURATION — SERVICES ONLY */}
        {displayItem.type === "SERVICE" && displayItem.durationMinutes ? (
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-neutral-400" />
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">Duración estimada:</span>
              <span className="text-sm font-semibold text-neutral-700">
                {`${displayItem.durationMinutes / 60} h`}
              </span>
            </div>
            {activeDays && (
              <div className="pt-3 border-t border-neutral-50 flex items-center justify-between">
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">Disponibilidad:</span>
                <span className="text-xs font-bold text-neutral-700">{activeDays}</span>
              </div>
            )}
          </div>
        ) : null}

        {/* SCHEDULE */}
        {groupedSchedule.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-3">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Horarios de atención</span>
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {groupedSchedule.map((sched: any) => (
                <div key={sched.day} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-neutral-700">{sched.label}</span>
                  <span className="text-neutral-500">{sched.ranges.join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DESCRIPTION */}
        {item.description && (
          <div className="space-y-2 px-1">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Descripción completa</span>
            <p className="text-sm text-neutral-600 leading-relaxed bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm whitespace-pre-wrap">
              {item.description}
            </p>
          </div>
        )}

        {/* CUSTOMIZATION — PRODUCTS ONLY */}
        {displayItem.type === "PRODUCT" && (
          <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm space-y-3">
            <div>
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Personalización</span>
              <p className="mt-1 text-xs font-semibold text-neutral-500">Configura grupos de opciones y personalizaciones de este producto.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/inventario?tab=recipes&itemId=${displayItem.id}`);
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition active:scale-[0.99] hover:bg-neutral-800"
            >
              Configurar en Inventario → Recetas
            </button>
          </div>
        )}

        {/* META INFO */}
        <div className="flex items-center gap-4 px-1 pt-2 pb-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest mb-1">Creado el</span>
            <div className="flex items-center gap-1.5 text-neutral-500">
              <Calendar size={12} />
              <span className="text-xs font-medium">{formatFullDate(item.createdAt || new Date().toISOString())}</span>
            </div>
          </div>
        </div>

      </div>
    </ItemPanelLayout>
  );
}
