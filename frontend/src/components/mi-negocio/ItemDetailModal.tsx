"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Edit, Trash2, Tag, Clock, Calendar, Info, Plus } from "lucide-react";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney } from "@/src/lib/formatters";
import { formatFullDate } from "@/src/lib/datetime";
import { api } from "@/src/lib/api";

import { groupScheduleByDay, formatActiveDaysCompact } from "@/src/lib/availability";
import { getItemBadges } from "@/src/lib/itemBadges";

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

function ProductCustomizationManager({ item }: { item: Item }) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [items, setItems] = useState<ItemOptionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({
    title: "",
    description: "",
    required: false,
    minSelections: "0",
    maxSelections: "",
    quantityMode: "NO_QUANTITY" as QuantityMode,
    totalQuantityLimit: "",
    totalQuantityUnitId: "",
  });
  const [optionForms, setOptionForms] = useState<Record<string, {
    name: string;
    priceDelta: string;
    targetType: TargetType;
    ingredientId: string;
    itemId: string;
    quantity: string;
    unitId: string;
    selectedByDefault: boolean;
    removable: boolean;
  }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [groupData, ingredientData, unitData, itemData] = await Promise.all([
        api<OptionGroup[]>(`/items/${item.id}/option-groups`),
        api<IngredientOption[]>("/ingredients"),
        api<UnitOption[]>("/inventory/units"),
        api<ItemOptionTarget[]>("/items?lightweight=true"),
      ]);
      setGroups(groupData);
      setIngredients(ingredientData);
      setUnits(unitData.filter((unit) => unit.kind !== "COMMERCIAL"));
      setItems(itemData.filter((target) => target.id !== item.id && target.type === "PRODUCT"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (item.type !== "PRODUCT") return;
    load().catch(() => {});
  }, [item.id, item.type]);

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupForm({
      title: "",
      description: "",
      required: false,
      minSelections: "0",
      maxSelections: "",
      quantityMode: "NO_QUANTITY",
      totalQuantityLimit: "",
      totalQuantityUnitId: "",
    });
  };

  const saveGroup = async () => {
    if (!groupForm.title.trim()) return;
    const payload = {
      title: groupForm.title.trim(),
      description: groupForm.description.trim() || null,
      required: groupForm.required,
      minSelections: Number(groupForm.minSelections || 0),
      maxSelections: groupForm.maxSelections ? Number(groupForm.maxSelections) : null,
      quantityMode: groupForm.quantityMode,
      totalQuantityLimit:
        groupForm.quantityMode === "SHARED_TOTAL" ? groupForm.totalQuantityLimit : null,
      totalQuantityUnitId:
        groupForm.quantityMode === "SHARED_TOTAL" ? groupForm.totalQuantityUnitId : null,
    };
    if (editingGroupId) {
      await api(`/items/${item.id}/option-groups/${editingGroupId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await api(`/items/${item.id}/option-groups`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    resetGroupForm();
    await load();
  };

  const editGroup = (group: OptionGroup) => {
    setEditingGroupId(group.id);
    setGroupForm({
      title: group.title,
      description: group.description ?? "",
      required: group.required,
      minSelections: String(group.minSelections ?? 0),
      maxSelections: group.maxSelections == null ? "" : String(group.maxSelections),
      quantityMode: group.quantityMode,
      totalQuantityLimit:
        group.totalQuantityLimit == null ? "" : String(group.totalQuantityLimit),
      totalQuantityUnitId: group.totalQuantityUnitId ?? "",
    });
  };

  const toggleGroup = async (group: OptionGroup) => {
    await api(`/items/${item.id}/option-groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !group.isActive }),
    });
    await load();
  };

  const optionFormFor = (group: OptionGroup) =>
    optionForms[group.id] ?? {
      name: "",
      priceDelta: "0",
      targetType:
        group.quantityMode === "SHARED_TOTAL"
          ? "INGREDIENT"
          : group.quantityMode === "NO_QUANTITY"
            ? "NONE"
            : "NONE",
      ingredientId: "",
      itemId: "",
      quantity: "",
      unitId: "",
      selectedByDefault: false,
      removable: true,
    };

  const setOptionForm = (groupId: string, next: ReturnType<typeof optionFormFor>) => {
    setOptionForms((prev) => ({ ...prev, [groupId]: next }));
  };

  const createOption = async (group: OptionGroup) => {
    const form = optionFormFor(group);
    if (!form.name.trim()) return;
    await api(`/items/${item.id}/option-groups/${group.id}/options`, {
      method: "POST",
      body: JSON.stringify({
        name: form.name.trim(),
        targetType: form.targetType,
        ingredientId: form.targetType === "INGREDIENT" ? form.ingredientId : null,
        itemId: form.targetType === "ITEM" ? form.itemId : null,
        quantity:
          group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE"
            ? form.quantity
            : null,
        unitId:
          group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE"
            ? form.unitId
            : null,
        priceDelta: form.priceDelta || "0",
        selectedByDefault: form.selectedByDefault,
        removable: form.removable,
      }),
    });
    setOptionForms((prev) => ({ ...prev, [group.id]: optionFormFor(group) }));
    await load();
  };

  const deactivateOption = async (group: OptionGroup, optionId: string) => {
    await api(`/items/${item.id}/option-groups/${group.id}/options/${optionId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });
    await load();
  };

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Personalización</span>
          <p className="mt-1 text-xs font-medium text-neutral-500">Grupos y opciones configurables para tienda pública.</p>
        </div>
        {loading ? <span className="text-[10px] font-bold uppercase text-neutral-400">Cargando</span> : null}
      </div>

      <div className="rounded-2xl bg-neutral-50 p-3 space-y-3">
        <input value={groupForm.title} onChange={(e) => setGroupForm((p) => ({ ...p, title: e.target.value }))} placeholder="Título del grupo" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none" />
        <input value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción opcional" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={groupForm.quantityMode} onChange={(e) => setGroupForm((p) => ({ ...p, quantityMode: e.target.value as QuantityMode }))} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold outline-none">
            <option value="NO_QUANTITY">Sin cantidad</option>
            <option value="FIXED_PER_OPTION">Cantidad fija</option>
            <option value="SHARED_TOTAL">Total repartido</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600">
            <input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm((p) => ({ ...p, required: e.target.checked, minSelections: e.target.checked && p.minSelections === "0" ? "1" : p.minSelections }))} />
            Obligatorio
          </label>
          <input value={groupForm.minSelections} onChange={(e) => setGroupForm((p) => ({ ...p, minSelections: e.target.value }))} inputMode="numeric" placeholder="Mínimo" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
          <input value={groupForm.maxSelections} onChange={(e) => setGroupForm((p) => ({ ...p, maxSelections: e.target.value }))} inputMode="numeric" placeholder="Máximo" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
        </div>
        {groupForm.quantityMode === "SHARED_TOTAL" ? (
          <div className="grid grid-cols-2 gap-2">
            <input value={groupForm.totalQuantityLimit} onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityLimit: e.target.value }))} inputMode="decimal" placeholder="Cantidad total" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
            <select value={groupForm.totalQuantityUnitId} onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityUnitId: e.target.value }))} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none">
              <option value="">Unidad</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol || unit.name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={saveGroup} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-xs font-semibold text-white">
            <Plus size={14} /> {editingGroupId ? "Guardar grupo" : "Crear grupo"}
          </button>
          {editingGroupId ? (
            <button type="button" onClick={resetGroupForm} className="h-10 rounded-xl bg-white px-4 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200">Cancelar</button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const form = optionFormFor(group);
          const targetChoices: TargetType[] =
            group.quantityMode === "SHARED_TOTAL"
              ? ["INGREDIENT"]
              : group.quantityMode === "NO_QUANTITY"
                ? ["NONE"]
                : ["NONE", "INGREDIENT", "ITEM"];
          return (
            <div key={group.id} className="rounded-2xl border border-neutral-100 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{group.title}</div>
                  <div className="text-[10px] font-semibold uppercase text-neutral-400">{group.quantityMode} · {group.options.length} opciones</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => editGroup(group)} className="rounded-lg bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600">Editar</button>
                  <button type="button" onClick={() => toggleGroup(group)} className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${group.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{group.isActive ? "Activo" : "Inactivo"}</button>
                </div>
              </div>

              {group.options.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((option) => (
                    <button key={option.id} type="button" onClick={() => deactivateOption(group, option.id)} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${option.isActive ? "bg-orange-50 text-orange-700" : "bg-neutral-100 text-neutral-400"}`}>
                      {option.name}{option.priceDelta ? ` +$${option.priceDelta}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <input value={form.name} onChange={(e) => setOptionForm(group.id, { ...form, name: e.target.value })} placeholder="Nueva opción" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                <input value={form.priceDelta} onChange={(e) => setOptionForm(group.id, { ...form, priceDelta: e.target.value })} inputMode="decimal" placeholder="Precio extra" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                <select value={form.targetType} onChange={(e) => setOptionForm(group.id, { ...form, targetType: e.target.value as TargetType })} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none">
                  {targetChoices.map((target) => <option key={target} value={target}>{target}</option>)}
                </select>
                {form.targetType === "INGREDIENT" ? (
                  <select value={form.ingredientId} onChange={(e) => setOptionForm(group.id, { ...form, ingredientId: e.target.value })} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none">
                    <option value="">Ingrediente</option>
                    {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
                  </select>
                ) : form.targetType === "ITEM" ? (
                  <select value={form.itemId} onChange={(e) => setOptionForm(group.id, { ...form, itemId: e.target.value })} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none">
                    <option value="">Producto</option>
                    {items.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                  </select>
                ) : <div />}
                {group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE" ? (
                  <>
                    <input value={form.quantity} onChange={(e) => setOptionForm(group.id, { ...form, quantity: e.target.value })} inputMode="decimal" placeholder="Cantidad" className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                    <select value={form.unitId} onChange={(e) => setOptionForm(group.id, { ...form, unitId: e.target.value })} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none">
                      <option value="">Unidad</option>
                      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol || unit.name}</option>)}
                    </select>
                  </>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[10px] font-semibold text-neutral-500"><input type="checkbox" checked={form.selectedByDefault} onChange={(e) => setOptionForm(group.id, { ...form, selectedByDefault: e.target.checked })} /> Default</label>
                <label className="flex items-center gap-2 text-[10px] font-semibold text-neutral-500"><input type="checkbox" checked={form.removable} onChange={(e) => setOptionForm(group.id, { ...form, removable: e.target.checked })} /> Removible</label>
                <button type="button" onClick={() => createOption(group)} className="rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-bold uppercase text-white">Crear opción</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ItemDetailModal({ item, open, onClose, onEdit, onDelete, recipeLineCount = 0 }: ItemDetailModalProps) {
  const router = useRouter();
  const [fullItem, setFullItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item?.id && item.type === "SERVICE") {
      // Si no tiene schedule o duration, hidratamos
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

  return (
    <ItemPanelLayout
      open={open}
      onClose={onClose}
      title="Detalle"
      subtitle={`#${displayItem.id.slice(-6).toUpperCase()}`}
    >
      <div className="space-y-6">
          
          {/* IMAGE SECTION ... (omitting for brevity in TargetContent if possible, but I'll include the whole block for safety) */}
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
                      className="rounded-xl px-3 py-1 text-[8px] font-semibold uppercase text-white"
                      style={{ background: badge.color }}
                    >
                      {badge.text}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 aspect-square w-full flex flex-col items-center justify-center text-neutral-400 gap-2">
              <Tag size={32} strokeWidth={1.5} />
              <p className="text-[10px] font-medium uppercase tracking-widest">Sin imágenes</p>
            </div>
          )}

          {/* MAIN INFO GRID */}
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-4">
            <div className="space-y-1">
                Nombre
              <h3 className="text-base font-medium text-neutral-900 leading-tight">{item.name}</h3>
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

            {displayItem.type === "SERVICE" && (
              <div className="pt-3 border-t border-neutral-50 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-neutral-400" />
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">Duración estimada:</span>
                  <span className="text-sm font-semibold text-neutral-700">{displayItem.durationMinutes} min</span>
                </div>

                {activeDays && (
                  <div className="flex items-start gap-2 pt-3 border-t border-neutral-50">
                    <Calendar size={14} className="text-neutral-400 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Días disponibles:</span>
                      <span className="text-sm font-semibold text-neutral-700">{activeDays}</span>
                    </div>
                  </div>
                )}

                {groupedSchedule.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-neutral-50">
                    <div className="flex items-center gap-2">
                      <Info size={14} className="text-neutral-400" />
                      <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">Horarios disponibles:</span>
                    </div>
                    
                    <div className="flex flex-col gap-2 pl-6">
                      {groupedSchedule.map((group) => (
                        <div key={group.day} className="flex flex-col bg-neutral-50/50 p-2 rounded-xl border border-neutral-100">
                          <span className="text-[11px] font-medium text-neutral-700">{group.label}</span>
                          <div className="flex flex-wrap gap-x-2">
                            {group.ranges.map((range, idx) => (
                              <span key={idx} className="text-xs text-neutral-500 font-medium">{range}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {loading && (
                    <div className="py-4 flex justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500" />
                    </div>
                )}
              </div>
            )}
          </div>

          {/* DESCRIPTION */}
          {item.description && (
            <div className="space-y-2 px-1">
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest block">Descripción completa</span>
              <p className="text-sm text-neutral-600 leading-relaxed bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm whitespace-pre-wrap">
                {item.description}
              </p>
            </div>
          )}

          {displayItem.type === "PRODUCT" ? (
            <ProductCustomizationManager item={displayItem} />
          ) : null}

          {/* META INFO */}
          <div className="flex items-center gap-4 px-1 pt-2">
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
