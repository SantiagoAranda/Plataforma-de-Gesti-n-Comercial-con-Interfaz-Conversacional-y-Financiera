"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, HelpCircle, Edit2, Check, X, AlertTriangle, Eye, EyeOff, Search } from "lucide-react";

import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { formatMoney } from "@/src/lib/formatters";
import type {
  Item,
  PublicItemOptionGroup as OptionGroup,
  PublicItemOption as Option,
  ItemOptionQuantityMode as QuantityMode,
  ItemOptionTargetType as TargetType,
} from "@/src/types/item";

type UnitOption = { id: string; name: string; symbol: string; kind: string };
type IngredientOption = { id: string; name: string; currentStock?: string | number; stockUnitId?: string | null };
type ItemOptionTarget = { id: string; name: string; inventoryMode?: string | null; type?: string };

interface ProductCustomizationManagerProps {
  item: Item;
  allIngredients: IngredientOption[];
}

export function ProductCustomizationManager({ item, allIngredients }: ProductCustomizationManagerProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [items, setItems] = useState<ItemOptionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Group Form
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

  // Options Forms
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

  // Autocomplete Search Queries
  const [ingredientSearch, setIngredientSearch] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});
  const [ingredientDropdownOpen, setIngredientDropdownOpen] = useState<Record<string, boolean>>({});
  const [itemDropdownOpen, setItemDropdownOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [groupData, unitData, itemData] = await Promise.all([
        api<any[]>(`/items/${item.id}/option-groups`),
        api<UnitOption[]>("/inventory/units"),
        api<ItemOptionTarget[]>("/items?lightweight=true"),
      ]);
      setGroups(groupData);
      setUnits(unitData.filter((unit) => unit.kind !== "COMMERCIAL"));
      setItems(itemData.filter((target) => target.id !== item.id && target.type === "PRODUCT"));
    } catch (error) {
      console.error(error);
      toast.error("No se pudieron cargar los datos de personalización.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (item.id && item.type === "PRODUCT") {
      load().catch(() => {});
    }
  }, [item.id]);

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
    if (!groupForm.title.trim()) {
      toast.error("El título del grupo es obligatorio.");
      return;
    }

    const minSelections = Number(groupForm.minSelections || 0);
    const maxSelections = groupForm.maxSelections ? Number(groupForm.maxSelections) : null;

    if (groupForm.required && minSelections < 1) {
      toast.error("Un grupo obligatorio requiere al menos 1 selección mínima.");
      return;
    }

    if (maxSelections !== null && minSelections > maxSelections) {
      toast.error("La selección mínima no puede superar la máxima.");
      return;
    }

    const payload = {
      title: groupForm.title.trim(),
      description: groupForm.description.trim() || null,
      required: groupForm.required,
      minSelections,
      maxSelections,
      quantityMode: groupForm.quantityMode,
      totalQuantityLimit:
        groupForm.quantityMode === "SHARED_TOTAL" ? Number(groupForm.totalQuantityLimit) : null,
      totalQuantityUnitId:
        groupForm.quantityMode === "SHARED_TOTAL" ? groupForm.totalQuantityUnitId : null,
    };

    try {
      if (editingGroupId) {
        await api(`/items/${item.id}/option-groups/${editingGroupId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Grupo de opciones actualizado");
      } else {
        await api(`/items/${item.id}/option-groups`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Grupo de opciones creado");
      }
      resetGroupForm();
      await load();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al guardar el grupo");
    }
  };

  const editGroup = (group: any) => {
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

  const toggleGroup = async (group: any) => {
    try {
      await api(`/items/${item.id}/option-groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !group.isActive }),
      });
      toast.success(group.isActive ? "Grupo desactivado" : "Grupo activado");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado del grupo");
    }
  };

  const optionFormFor = (group: any) =>
    optionForms[group.id] ?? {
      name: "",
      priceDelta: "0",
      targetType:
        group.quantityMode === "SHARED_TOTAL"
          ? "INGREDIENT"
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

  const createOption = async (group: any) => {
    const form = optionFormFor(group);
    if (!form.name.trim()) {
      toast.error("El nombre de la opción es obligatorio.");
      return;
    }

    if (form.targetType === "INGREDIENT" && !form.ingredientId) {
      toast.error("Debes seleccionar un insumo de inventario.");
      return;
    }

    if (form.targetType === "ITEM" && !form.itemId) {
      toast.error("Debes seleccionar un producto de venta.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      targetType: form.targetType,
      ingredientId: form.targetType === "INGREDIENT" ? form.ingredientId : null,
      itemId: form.targetType === "ITEM" ? form.itemId : null,
      quantity:
        group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE"
          ? Number(form.quantity || 1)
          : null,
      unitId:
        group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE"
          ? form.unitId
          : null,
      priceDelta: Number(form.priceDelta || 0),
      selectedByDefault: form.selectedByDefault,
      removable: form.removable,
    };

    try {
      await api(`/items/${item.id}/option-groups/${group.id}/options`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Opción creada correctamente");
      // Reset form
      setOptionForm(group.id, {
        name: "",
        priceDelta: "0",
        targetType: group.quantityMode === "SHARED_TOTAL" ? "INGREDIENT" : "NONE",
        ingredientId: "",
        itemId: "",
        quantity: "",
        unitId: "",
        selectedByDefault: false,
        removable: true,
      });
      // Clear searches
      setIngredientSearch((prev) => ({ ...prev, [group.id]: "" }));
      setItemSearch((prev) => ({ ...prev, [group.id]: "" }));
      await load();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al crear la opción");
    }
  };

  const toggleOptionActive = async (group: any, option: any) => {
    try {
      await api(`/items/${item.id}/option-groups/${group.id}/options/${option.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !option.isActive }),
      });
      toast.success(option.isActive ? "Opción desactivada" : "Opción activada");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado de la opción");
    }
  };

  const deleteOption = async (group: any, optionId: string) => {
    try {
      const res: any = await api(`/items/${item.id}/option-groups/${group.id}/options/${optionId}`, {
        method: "DELETE",
      });
      if (res?.deactivated) {
        toast((t) => (
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs text-slate-800">Opción en uso</p>
              <p className="text-[11px] text-slate-500 mt-0.5">La opción está en órdenes previas. Fue desactivada en lugar de eliminarse por completo.</p>
            </div>
          </div>
        ), { duration: 5000 });
      } else {
        toast.success("Opción eliminada");
      }
      await load();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar la opción");
    }
  };

  // Helper translations for humanized UI
  const translateQuantityMode = (mode: QuantityMode) => {
    switch (mode) {
      case "NO_QUANTITY":
        return "Sin cantidad (solo selección)";
      case "FIXED_PER_OPTION":
        return "Cantidad fija por opción";
      case "SHARED_TOTAL":
        return "Cantidad compartida entre opciones";
      default:
        return mode;
    }
  };

  const translateTargetType = (type: TargetType) => {
    switch (type) {
      case "NONE":
        return "Sin impacto en inventario";
      case "INGREDIENT":
        return "Insumo de inventario";
      case "ITEM":
        return "Producto de venta";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t border-slate-100/80">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Personalización del Producto
          </h4>
          <p className="mt-1 text-[11px] text-slate-500 font-semibold leading-relaxed">
            Configura las preguntas, ingredientes o productos que el cliente puede elegir al ordenar este producto.
          </p>
        </div>
      </div>

      {/* CREATE / EDIT GROUP PANEL */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-3.5 space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            {editingGroupId ? "Editar Grupo de Opciones" : "Nuevo Grupo de Opciones"}
          </span>
          {editingGroupId && (
            <button
              type="button"
              onClick={resetGroupForm}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-650"
            >
              Cancelar Edición
            </button>
          )}
        </div>

        <div className="space-y-2">
          <input
            value={groupForm.title}
            onChange={(e) => setGroupForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Título del grupo (ej: Elige tu salsa, Toppings extra)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
          />
          <input
            value={groupForm.description}
            onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Descripción o ayuda (ej: Elige hasta 3 ingredientes)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-slate-400 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Modo de consumo</span>
            <select
              value={groupForm.quantityMode}
              onChange={(e) => setGroupForm((p) => ({ ...p, quantityMode: e.target.value as QuantityMode }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
            >
              <option value="NO_QUANTITY">{translateQuantityMode("NO_QUANTITY")}</option>
              <option value="FIXED_PER_OPTION">{translateQuantityMode("FIXED_PER_OPTION")}</option>
              <option value="SHARED_TOTAL">{translateQuantityMode("SHARED_TOTAL")}</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex w-full h-[38px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition">
              <input
                type="checkbox"
                checked={groupForm.required}
                onChange={(e) =>
                  setGroupForm((p) => ({
                    ...p,
                    required: e.target.checked,
                    minSelections: e.target.checked && p.minSelections === "0" ? "1" : p.minSelections,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              ¿Es Obligatorio?
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Selecciones Mínimas</span>
            <input
              value={groupForm.minSelections}
              onChange={(e) => setGroupForm((p) => ({ ...p, minSelections: e.target.value }))}
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Selecciones Máximas</span>
            <input
              value={groupForm.maxSelections}
              onChange={(e) => setGroupForm((p) => ({ ...p, maxSelections: e.target.value }))}
              inputMode="numeric"
              placeholder="Sin límite"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
            />
          </div>
        </div>

        {groupForm.quantityMode === "SHARED_TOTAL" && (
          <div className="grid grid-cols-2 gap-2 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Cantidad Total Compartida</span>
              <input
                value={groupForm.totalQuantityLimit}
                onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityLimit: e.target.value }))}
                inputMode="decimal"
                placeholder="100"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-755 outline-none focus:border-slate-400 transition"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Unidad de medida</span>
              <select
                value={groupForm.totalQuantityUnitId}
                onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityUnitId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
              >
                <option value="">Seleccionar unidad...</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.symbol || unit.name} ({unit.name})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={saveGroup}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> {editingGroupId ? "Guardar cambios de grupo" : "Crear grupo de opciones"}
        </button>
      </div>

      {/* GROUPS LIST */}
      <div className="space-y-4">
        {groups.map((group) => {
          const form = optionFormFor(group);
          const targetChoices: TargetType[] =
            group.quantityMode === "SHARED_TOTAL"
              ? ["INGREDIENT"]
              : group.quantityMode === "NO_QUANTITY"
                ? ["NONE"]
                : ["NONE", "INGREDIENT", "ITEM"];

          const filteredIngredients = allIngredients.filter((ing) =>
            ing.name.toLowerCase().includes((ingredientSearch[group.id] || "").toLowerCase())
          );

          const filteredItems = items.filter((it) =>
            it.name.toLowerCase().includes((itemSearch[group.id] || "").toLowerCase())
          );

          return (
            <div
              key={group.id}
              className={cn(
                "rounded-2xl border border-slate-100 bg-slate-50/20 p-3.5 space-y-3 transition shadow-2xs",
                !group.isActive && "opacity-75 bg-slate-50/5 border-dashed border-slate-200"
              )}
            >
              {/* GROUP HEADER */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-800 leading-tight">
                      {group.title}
                    </span>
                    {!group.isActive && (
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                      {group.description}
                    </p>
                  )}
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mt-1">
                    {translateQuantityMode(group.quantityMode)} · {group.required ? "Obligatorio" : "Opcional"} (mín {group.minSelections} / máx {group.maxSelections || "unl"})
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => editGroup(group)}
                    className="grid h-7 px-2.5 place-items-center rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800 active:scale-95"
                  >
                    <Edit2 className="h-3 w-3 inline mr-1" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className={cn(
                      "grid h-7 px-2.5 place-items-center rounded-lg border text-[10px] font-bold transition active:scale-95",
                      group.isActive
                        ? "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    )}
                  >
                    {group.isActive ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>

              {/* OPTIONS LIST */}
              {group.options.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    Opciones configuradas:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.options.map((option: any) => {
                      const consumesStock = option.targetType !== "NONE";
                      let stockText = "";
                      let lowStock = false;

                      if (option.targetType === "INGREDIENT") {
                        const ing = allIngredients.find((i) => i.id === option.ingredientId);
                        if (ing) {
                          const stockNum = Number(ing.currentStock || 0);
                          stockText = `Stock: ${formatMoney(stockNum)}`;
                          
                          // Determine required stock limit
                          let limit = 1;
                          if (group.quantityMode === "SHARED_TOTAL") {
                            limit = group.totalQuantityLimit ? Number(group.totalQuantityLimit) : 1;
                          } else if (group.quantityMode === "FIXED_PER_OPTION") {
                            limit = option.quantity ? Number(option.quantity) : 1;
                          }
                          lowStock = stockNum < limit;
                        }
                      }

                      return (
                        <div
                          key={option.id}
                          className={cn(
                            "flex items-center justify-between gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-2xs transition",
                            !option.isActive && "opacity-60 bg-slate-50/30 border-dashed",
                            lowStock && option.isActive && "border-amber-200 bg-amber-50/20"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 truncate">
                                {option.name}
                              </span>
                              {option.selectedByDefault && (
                                <span className="rounded bg-slate-900 px-1 text-[8px] font-bold text-white uppercase tracking-wider">
                                  Def
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-slate-400 font-semibold mt-0.5 space-y-0.5">
                              <div>
                                {translateTargetType(option.targetType)}
                                {option.targetType === "INGREDIENT" && option.ingredient && ` (${option.ingredient.name})`}
                                {option.targetType === "ITEM" && option.item && ` (${option.item.name})`}
                                {option.targetType === "INGREDIENT" && option.quantity && ` · ${option.quantity} ${option.unit?.symbol || ""}`}
                              </div>
                              {stockText && (
                                <div className={cn("font-bold", lowStock ? "text-amber-600" : "text-slate-500")}>
                                  {stockText} {lowStock ? " (Sin stock suficiente)" : ""}
                                </div>
                              )}
                            </div>
                            {option.priceDelta > 0 && (
                              <span className="mt-1 block text-[10px] font-extrabold text-orange-600">
                                +${formatMoney(option.priceDelta)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Toggle Active Status */}
                            <button
                              type="button"
                              onClick={() => toggleOptionActive(group, option)}
                              className={cn(
                                "grid h-6 w-6 place-items-center rounded-lg border transition active:scale-90",
                                option.isActive
                                  ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                  : "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100"
                              )}
                              title={option.isActive ? "Desactivar opción" : "Activar opción"}
                            >
                              {option.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            {/* Delete Option */}
                            <button
                              type="button"
                              onClick={() => deleteOption(group, option.id)}
                              className="grid h-6 w-6 place-items-center rounded-lg bg-rose-50 border border-rose-100 text-rose-600 transition hover:bg-rose-100 active:scale-90"
                              title="Eliminar opción"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CREATE OPTION PANEL FOR THIS GROUP */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 mt-2.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Agregar opción
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nombre</span>
                    <input
                      value={form.name}
                      onChange={(e) => setOptionForm(group.id, { ...form, name: e.target.value })}
                      placeholder="Queso Cheddar, Con hielo"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Precio extra</span>
                    <input
                      value={form.priceDelta}
                      onChange={(e) => setOptionForm(group.id, { ...form, priceDelta: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tipo de impacto</span>
                    <select
                      value={form.targetType}
                      onChange={(e) =>
                        setOptionForm(group.id, {
                          ...form,
                          targetType: e.target.value as TargetType,
                          ingredientId: "",
                          itemId: "",
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                    >
                      {targetChoices.map((target) => (
                        <option key={target} value={target}>
                          {translateTargetType(target)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    {form.targetType === "INGREDIENT" ? (
                      <div className="relative">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Insumo (Buscar)
                        </span>
                        <div className="relative">
                          <input
                            type="text"
                            value={ingredientSearch[group.id] || ""}
                            onFocus={() => setIngredientDropdownOpen((prev) => ({ ...prev, [group.id]: true }))}
                            onChange={(e) => {
                              setIngredientSearch((prev) => ({ ...prev, [group.id]: e.target.value }));
                              setIngredientDropdownOpen((prev) => ({ ...prev, [group.id]: true }));
                            }}
                            placeholder="Buscar insumo..."
                            className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                          />
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        </div>

                        {/* Search dropdown */}
                        {ingredientDropdownOpen[group.id] && (
                          <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                            {filteredIngredients.length === 0 ? (
                              <div className="p-2 text-xs text-slate-500 font-semibold">No se encontraron insumos</div>
                            ) : (
                              filteredIngredients.map((ing) => (
                                <button
                                  key={ing.id}
                                  type="button"
                                  onClick={() => {
                                    setOptionForm(group.id, { ...form, ingredientId: ing.id });
                                    setIngredientSearch((prev) => ({ ...prev, [group.id]: ing.name }));
                                    setIngredientDropdownOpen((prev) => ({ ...prev, [group.id]: false }));
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between p-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50",
                                    form.ingredientId === ing.id && "bg-slate-100 text-slate-900"
                                  )}
                                >
                                  <span>{ing.name}</span>
                                  {ing.currentStock !== undefined && (
                                    <span className="text-[10px] text-slate-400 font-semibold">
                                      Stock: {formatMoney(Number(ing.currentStock))}
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : form.targetType === "ITEM" ? (
                      <div className="relative">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Producto (Buscar)
                        </span>
                        <div className="relative">
                          <input
                            type="text"
                            value={itemSearch[group.id] || ""}
                            onFocus={() => setItemDropdownOpen((prev) => ({ ...prev, [group.id]: true }))}
                            onChange={(e) => {
                              setItemSearch((prev) => ({ ...prev, [group.id]: e.target.value }));
                              setItemDropdownOpen((prev) => ({ ...prev, [group.id]: true }));
                            }}
                            placeholder="Buscar producto..."
                            className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                          />
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        </div>

                        {/* Search dropdown */}
                        {itemDropdownOpen[group.id] && (
                          <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                            {filteredItems.length === 0 ? (
                              <div className="p-2 text-xs text-slate-500 font-semibold">No se encontraron productos</div>
                            ) : (
                              filteredItems.map((it) => (
                                <button
                                  key={it.id}
                                  type="button"
                                  onClick={() => {
                                    setOptionForm(group.id, { ...form, itemId: it.id });
                                    setItemSearch((prev) => ({ ...prev, [group.id]: it.name }));
                                    setItemDropdownOpen((prev) => ({ ...prev, [group.id]: false }));
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between p-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50",
                                    form.itemId === it.id && "bg-slate-100 text-slate-900"
                                  )}
                                >
                                  <span>{it.name}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>

                {group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE" && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/30 p-2 rounded-xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cantidad</span>
                      <input
                        value={form.quantity}
                        onChange={(e) => setOptionForm(group.id, { ...form, quantity: e.target.value })}
                        inputMode="decimal"
                        placeholder="1"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Unidad</span>
                      <select
                        value={form.unitId}
                        onChange={(e) => setOptionForm(group.id, { ...form, unitId: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-750 outline-none focus:border-slate-400 transition"
                      >
                        <option value="">Seleccionar unidad...</option>
                        {units.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.symbol || unit.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.selectedByDefault}
                        onChange={(e) => setOptionForm(group.id, { ...form, selectedByDefault: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      Preselección
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.removable}
                        onChange={(e) => setOptionForm(group.id, { ...form, removable: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      Removible
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => createOption(group)}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.98]"
                  >
                    Crear opción
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
