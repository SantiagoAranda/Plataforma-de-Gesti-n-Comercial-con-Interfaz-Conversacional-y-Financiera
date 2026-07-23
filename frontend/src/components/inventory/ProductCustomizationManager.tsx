"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, HelpCircle, Pencil, Check, X, AlertTriangle, Eye, EyeOff, Search, ChevronDown, Layers } from "lucide-react";

import { QuantityStepper, getStepAndPrecisionForUnit } from "@/src/components/inventory/QuantityStepper";
import { api } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";
import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";
import type {
  Item,
  PublicItemOptionGroup as OptionGroup,
  PublicItemOption as Option,
  ItemOptionQuantityMode as QuantityMode,
  ItemOptionTargetType as TargetType,
} from "@/src/types/item";

type UnitOption = { id: string; name: string; symbol: string; kind: string };
type IngredientOption = {
  id: string;
  name: string;
  currentStock?: string | number;
  averageCost?: string | number;
  stockUnitId?: string | null;
};
type ItemOptionTarget = {
  id: string;
  name: string;
  inventoryMode?: string | null;
  type?: string;
  currentStock?: string | number | null;
  averageCost?: string | number | null;
  status?: string;
};

interface ProductCustomizationManagerProps {
  item: Item;
  allIngredients: IngredientOption[];
  hideHeader?: boolean;
  onSaveContextChange?: (context: {
    message: string;
    saveLabel: string;
    isSaving: boolean;
    onSave: () => void | Promise<void>;
    onDiscard: () => void;
  } | null) => void;
}

function formatQuantity(value: number | string | null | undefined) {
  return formatQuantityCompact(value);
}

export function ProductCustomizationManager({ item, allIngredients, hideHeader = false, onSaveContextChange }: ProductCustomizationManagerProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [items, setItems] = useState<ItemOptionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [creatingOptionForGroupId, setCreatingOptionForGroupId] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingOption, setSavingOption] = useState(false);
  const destructiveInFlightRef = useRef(false);

  // Group Form
  const [groupForm, setGroupForm] = useState({
    title: "",
    description: "",
    required: false,
    minSelections: "0",
    maxSelections: "",
    quantityMode: "FIXED_PER_OPTION" as QuantityMode,
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
      setItems(itemData.filter((target) =>
        target.id !== item.id && target.type === "PRODUCT" &&
        target.inventoryMode === "SIMPLE" && target.status === "ACTIVE"
      ));
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
    setShowGroupForm(false);
    setGroupForm({
      title: "",
      description: "",
      required: false,
      minSelections: "0",
      maxSelections: "",
      quantityMode: "FIXED_PER_OPTION",
      totalQuantityLimit: "",
      totalQuantityUnitId: "",
    });
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const saveGroup = async () => {
    if (savingGroup) return;
    if (!groupForm.title.trim()) {
      toast.error("El título del grupo es obligatorio.");
      return;
    }

    const minSelections = Number(groupForm.minSelections || 0);
    const maxSelections = groupForm.maxSelections ? Number(groupForm.maxSelections) : null;
    const totalQuantityLimit = Number(groupForm.totalQuantityLimit.replace(",", "."));

    if (groupForm.required && minSelections < 1) {
      toast.error("Un grupo obligatorio requiere al menos 1 selección mínima.");
      return;
    }

    if (maxSelections !== null && minSelections > maxSelections) {
      toast.error("La selección mínima no puede superar la máxima.");
      return;
    }
    if (groupForm.quantityMode === "SHARED_TOTAL" && (!Number.isFinite(totalQuantityLimit) || totalQuantityLimit <= 0 || !groupForm.totalQuantityUnitId)) {
      toast.error("Indica una cantidad total mayor que cero y su unidad.");
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
        groupForm.quantityMode === "SHARED_TOTAL" ? totalQuantityLimit : null,
      totalQuantityUnitId:
        groupForm.quantityMode === "SHARED_TOTAL" ? groupForm.totalQuantityUnitId : null,
    };

    try {
      setSavingGroup(true);
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
      setShowGroupForm(false);
      await load();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al guardar el grupo");
    } finally {
      setSavingGroup(false);
    }
  };

  const editGroup = (group: any) => {
    setEditingGroupId(group.id);
    setShowGroupForm(true);
    setExpandedGroupIds((prev) => ({ ...prev, [group.id]: true }));
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

  const showTemporarySuccess = (message: string, duration = 1800) => {
    const resultToastId = toast.success(message, { duration: Infinity });
    if (typeof window !== "undefined") {
      window.setTimeout(() => toast.remove(resultToastId), duration);
    }
  };

  const confirmDestructiveAction = (input: {
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }) => {
    const confirmationToastId = toast.custom((toastInstance) => (
      <div className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <p className="text-sm font-medium text-black">{input.title}</p>
        <p className="mt-1 text-xs text-slate-600">{input.description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => toast.remove(confirmationToastId)} className="rounded-lg px-3 py-2 text-xs text-slate-700">Cancelar</button>
          <button type="button" onClick={() => {
            if (destructiveInFlightRef.current) return;
            destructiveInFlightRef.current = true;
            toast.remove(confirmationToastId);
            void input.onConfirm().finally(() => { destructiveInFlightRef.current = false; });
          }} className="rounded-lg bg-[#c80237] px-3 py-2 text-xs font-medium text-white">Quitar</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const performDeleteGroup = async (group: any) => {
    try {
      const result: any = await api(`/items/${item.id}/option-groups/${group.id}`, {
        method: "DELETE",
      });
      showTemporarySuccess(
        result?.deactivated ? "Grupo deshabilitado para conservar el historial" : "Grupo eliminado",
        result?.deactivated ? 2500 : 1800,
      );
      await load();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado del grupo", { duration: 5000 });
    }
  };

  const optionFormFor = (group: any) =>
    optionForms[group.id] ?? {
      name: "",
      priceDelta: "0",
      targetType:
        "INGREDIENT",
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

  const saveOption = async (group: any) => {
    if (savingOption) return;
    const form = optionFormFor(group);
    if (!form.name.trim()) {
      toast.error("El nombre de la opción es obligatorio.");
      return;
    }

    if (form.targetType === "INGREDIENT" && !form.ingredientId) {
      toast.error("Debes seleccionar un insumo de inventario.");
      return;
    }

    if (form.targetType === "INGREDIENT" && form.ingredientId) {
      const dup = group.options.some((o: any) =>
        o.isActive &&
        o.targetType === "INGREDIENT" &&
        o.ingredientId === form.ingredientId &&
        o.id !== editingOptionId
      );
      if (dup) {
        toast.error("Este insumo ya está agregado en este grupo.");
        return;
      }
    }

    if (form.targetType === "ITEM" && !form.itemId) {
      toast.error("Debes seleccionar un producto de venta.");
      return;
    }

    if (form.targetType === "ITEM" && form.itemId) {
      const dup = group.options.some((o: any) =>
        o.isActive &&
        o.targetType === "ITEM" &&
        o.itemId === form.itemId &&
        o.id !== editingOptionId
      );
      if (dup) {
        toast.error("Este producto ya está agregado en este grupo.");
        return;
      }
    }

    if (form.targetType === "NONE" && form.name) {
      const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedInput = normalizeName(form.name);
      const dup = group.options.some((o: any) =>
        o.isActive &&
        o.targetType === "NONE" &&
        normalizeName(o.name) === normalizedInput &&
        o.id !== editingOptionId
      );
      if (dup) {
        toast.error("Ya existe una opción con ese nombre en este grupo.");
        return;
      }
    }

    // Determine unitId automatically for INGREDIENT targetType
    let resolvedUnitId = form.unitId;
    if (form.targetType === "INGREDIENT" && form.ingredientId) {
      const ing = allIngredients.find((i) => i.id === form.ingredientId);
      if (ing && ing.stockUnitId) {
        resolvedUnitId = ing.stockUnitId;
      }
    }

    const payload = {
      name: form.name.trim(),
      targetType: form.targetType,
      ingredientId: form.targetType === "INGREDIENT" ? form.ingredientId : null,
      itemId: form.targetType === "ITEM" ? form.itemId : null,
      quantity:
        group.quantityMode === "FIXED_PER_OPTION"
          ? Number(form.quantity || 1)
          : null,
      unitId: editingOptionId
        ? (form.unitId || null)
        : form.targetType === "ITEM" ? null : resolvedUnitId,
      priceDelta: Number(form.priceDelta || 0),
      selectedByDefault: form.selectedByDefault,
      removable: form.removable,
    };

    try {
      setSavingOption(true);
      if (editingOptionId) {
        await api(`/items/${item.id}/option-groups/${group.id}/options/${editingOptionId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Opción actualizada correctamente");
      } else {
        await api(`/items/${item.id}/option-groups/${group.id}/options`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Opción creada correctamente");
      }

      // Reset form
      setEditingOptionId(null);
      setOptionForm(group.id, {
        name: "",
        priceDelta: "0",
        targetType: "INGREDIENT",
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
      setCreatingOptionForGroupId(null);
      await load();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al guardar la opción");
    } finally {
      setSavingOption(false);
    }
  };

  const editOption = (group: any, option: any) => {
    setEditingOptionId(option.id);
    setCreatingOptionForGroupId(group.id);
    setExpandedGroupIds((prev) => ({ ...prev, [group.id]: true }));
    setOptionForm(group.id, {
      name: option.name,
      priceDelta: String(option.priceDelta),
      targetType: option.targetType,
      ingredientId: option.ingredientId ?? "",
      itemId: option.itemId ?? "",
      quantity: option.quantity == null ? "" : String(option.quantity),
      unitId: option.unitId ?? "",
      selectedByDefault: option.selectedByDefault,
      removable: option.removable,
    });

    if (option.targetType === "INGREDIENT" && option.ingredientId) {
      const ing = allIngredients.find((i) => i.id === option.ingredientId);
      if (ing) {
        setIngredientSearch((prev) => ({ ...prev, [group.id]: ing.name }));
      }
    }
    if (option.targetType === "ITEM" && option.itemId) {
      const it = items.find((i) => i.id === option.itemId);
      if (it) {
        setItemSearch((prev) => ({ ...prev, [group.id]: it.name }));
      }
    }
  };

  const cancelEditOption = (group: any) => {
    setEditingOptionId(null);
    setCreatingOptionForGroupId(null);
    setOptionForm(group.id, {
      name: "",
      priceDelta: "0",
        targetType: "INGREDIENT",
      ingredientId: "",
      itemId: "",
      quantity: "",
      unitId: "",
      selectedByDefault: false,
      removable: true,
    });
    setIngredientSearch((prev) => ({ ...prev, [group.id]: "" }));
    setItemSearch((prev) => ({ ...prev, [group.id]: "" }));
  };

  const deleteGroup = (group: any) => confirmDestructiveAction({
    title: "¿Quitar este grupo?",
    description: "Si ya fue utilizado, se deshabilitará para conservar el historial.",
    onConfirm: () => performDeleteGroup(group),
  });

  const requestDiscard = (discard: () => void) => discard();

  useEffect(() => {
    if (showGroupForm) {
      onSaveContextChange?.({
        message: `Cambios en “${groupForm.title || "grupo nuevo"}”`,
        saveLabel: "Guardar grupo",
        isSaving: savingGroup,
        onSave: saveGroup,
        onDiscard: () => requestDiscard(resetGroupForm),
      });
      return;
    }
    const optionGroup = groups.find((group) => group.id === creatingOptionForGroupId);
    if (optionGroup) {
      const form = optionFormFor(optionGroup);
      onSaveContextChange?.({
        message: `Cambios en “${form.name || "opción nueva"}”`,
        saveLabel: "Guardar opción",
        isSaving: savingOption,
        onSave: () => saveOption(optionGroup),
        onDiscard: () => requestDiscard(() => cancelEditOption(optionGroup)),
      });
      return;
    }
    onSaveContextChange?.(null);
  }, [showGroupForm, groupForm, savingGroup, creatingOptionForGroupId, optionForms, savingOption, groups, item.id]);

  const performDeleteOption = async (group: any, optionId: string) => {
    try {
      const res: any = await api(`/items/${item.id}/option-groups/${group.id}/options/${optionId}`, {
        method: "DELETE",
      });
      showTemporarySuccess(
        res?.deactivated
          ? "Opción deshabilitada para conservar el historial"
          : "Opción eliminada",
        res?.deactivated ? 2500 : 1800,
      );
      await load();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar la opción", { duration: 5000 });
    }
  };

  const deleteOption = (group: any, optionId: string) => confirmDestructiveAction({
    title: "¿Quitar esta opción?",
    description: "Si ya fue utilizada, se deshabilitará para conservar el historial.",
    onConfirm: () => performDeleteOption(group, optionId),
  });

  // Helpers
  const areUnitsCompatible = (unitIdA: string, unitIdB: string) => {
    if (unitIdA === unitIdB) return true;
    const unitA = units.find((u) => u.id === unitIdA);
    const unitB = units.find((u) => u.id === unitIdB);
    if (!unitA || !unitB) return false;
    return unitA.kind === unitB.kind;
  };

  const isOptionUnitIncompatible = (option: any, group: any) => {
    if (option.targetType !== "INGREDIENT") return false;
    const ing = allIngredients.find((i) => i.id === option.ingredientId);
    if (!ing) return false;

    if (group.quantityMode === "SHARED_TOTAL") {
      if (!group.totalQuantityUnitId || !ing.stockUnitId) return true;
      return !areUnitsCompatible(ing.stockUnitId, group.totalQuantityUnitId);
    }
    if (group.quantityMode === "FIXED_PER_OPTION") {
      return option.unitId !== ing.stockUnitId;
    }
    return false;
  };

  const translateQuantityMode = (mode: QuantityMode) => {
    switch (mode) {
      case "NO_QUANTITY":
        return "Solo selección";
      case "FIXED_PER_OPTION":
        return "Cantidad por opción";
      case "SHARED_TOTAL":
        return "Cantidad total compartida";
      default:
        return mode;
    }
  };

  const quantityModeHelp = (mode: QuantityMode) => {
    switch (mode) {
      case "NO_QUANTITY":
        return "La opción no descuenta cantidades propias.";
      case "FIXED_PER_OPTION":
        return "Cada opción descuenta su propia cantidad.";
      case "SHARED_TOTAL":
        return "El grupo reparte una cantidad total entre las opciones elegidas.";
      default:
        return "";
    }
  };

  const translateTargetType = (type: TargetType) => {
    switch (type) {
      case "NONE":
        return "Sin recurso asociado";
      case "INGREDIENT":
        return "Ingrediente o insumo";
      case "ITEM":
        return "Producto del catálogo";
      default:
        return type;
    }
  };

  const toNumber = (value: number | string | null | undefined) => {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  };

  const unitLabel = (unitId?: string | null) => {
    if (!unitId) return "";
    const unit = units.find((candidate) => candidate.id === unitId);
    return unit?.symbol || unit?.name || "";
  };

  const unitObjectLabel = (unit?: any | null) =>
    unit?.symbol || unit?.abbreviation || unit?.label || unit?.name || "";

  const quantityWithUnit = (quantity: number | string | null | undefined, unit: string) =>
    `${formatQuantity(quantity)}${unit ? ` ${unit}` : ""}`;

  const optionQuantity = (group: any, option: any) => {
    if (option.targetType === "NONE" || group.quantityMode === "NO_QUANTITY") return 0;
    if (group.quantityMode === "SHARED_TOTAL") return toNumber(group.totalQuantityLimit);
    return toNumber(option.quantity || 1);
  };

  const inventoryEffectLabel = (targetType: TargetType) => {
    switch (targetType) {
      case "NONE":
        return "No afecta inventario";
      case "INGREDIENT":
        return "Descuenta insumo";
      case "ITEM":
        return "Descuenta producto";
      default:
        return "";
    }
  };

  const optionResourceName = (option: any) => {
    if (option.targetType === "INGREDIENT") {
      return option.ingredient?.name || allIngredients.find((ing) => ing.id === option.ingredientId)?.name || "";
    }
    if (option.targetType === "ITEM") {
      return option.item?.name || items.find((target) => target.id === option.itemId)?.name || "";
    }
    return "";
  };

  const optionQuantityLabel = (group: any, option: any) => {
    if (option.targetType === "NONE" || group.quantityMode === "NO_QUANTITY") return "Sin consumo directo";
    if (group.quantityMode === "SHARED_TOTAL") return "Total compartido";
    const quantity = optionQuantity(group, option);
    if (option.targetType === "ITEM") {
      return quantityWithUnit(quantity, unitObjectLabel(option.unit));
    }
    const unit =
      unitObjectLabel(option.unit) ||
      unitObjectLabel(group.totalQuantityUnit) ||
      unitLabel(option.unitId || group.totalQuantityUnitId);
    return quantityWithUnit(quantity, unit);
  };

  const optionCostLabel = (group: any, option: any) => {
    const quantity = optionQuantity(group, option);

    if (option.targetType === "NONE") return `$${formatMoney(0)}`;

    if (option.targetType === "INGREDIENT") {
      const ingredient = allIngredients.find((ing) => ing.id === option.ingredientId);
      return `$${formatMoney(quantity * toNumber(ingredient?.averageCost))}`;
    }

    if (option.targetType === "ITEM") {
      const target = items.find((candidate) => candidate.id === option.itemId);
      const inventoryMode = option.item?.inventoryMode || target?.inventoryMode;
      if (inventoryMode === "RECIPE_BASED") return "Costo calculado al vender";
      return `$${formatMoney(quantity * toNumber(target?.averageCost))}`;
    }

    return `$${formatMoney(0)}`;
  };

  const optionStockLabel = (group: any, option: any) => {
    if (option.targetType === "NONE") return "No aplica";
    if (option.targetType === "INGREDIENT") {
      const ingredient = allIngredients.find((ing) => ing.id === option.ingredientId);
      const unit = unitLabel(ingredient?.stockUnitId) || unitLabel(option.unitId || group.totalQuantityUnitId);
      return ingredient ? `${formatQuantity(ingredient.currentStock)}${unit ? ` ${unit}` : ""}` : "Sin dato";
    }
    if (option.targetType === "ITEM") {
      const target = items.find((candidate) => candidate.id === option.itemId);
      const inventoryMode = option.item?.inventoryMode || target?.inventoryMode;
      if (inventoryMode === "RECIPE_BASED") return "Según receta asociada";
      return target?.currentStock == null ? "Sin dato" : quantityWithUnit(target.currentStock, unitObjectLabel(option.unit));
    }
    return "Sin dato";
  };

  const optionUsesLabel = (group: any, option: any) => {
    const quantity = optionQuantity(group, option);
    if (option.targetType === "NONE") return "Sin consumo";
    if (option.targetType === "ITEM") {
      const target = items.find((candidate) => candidate.id === option.itemId);
      const inventoryMode = option.item?.inventoryMode || target?.inventoryMode;
      if (inventoryMode === "RECIPE_BASED") return "Según receta asociada";
      return quantity > 0 ? formatQuantity(Math.floor(toNumber(target?.currentStock) / quantity)) : "0";
    }
    if (option.targetType === "INGREDIENT") {
      const ingredient = allIngredients.find((ing) => ing.id === option.ingredientId);
      return quantity > 0 ? formatQuantity(Math.floor(toNumber(ingredient?.currentStock) / quantity)) : "0";
    }
    return "0";
  };

  const renderGroupForm = ({ mode }: { mode: "create" | "edit" }) => (
    <div className={cn("rounded-xl border-2 border-[#0b3f64] bg-white p-3.5 space-y-3 shadow-xs", mode === "create" && "order-last")}>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <span className="text-[10px] font-medium text-black uppercase tracking-wide">
          {mode === "edit" ? "EDITAR GRUPO" : "+ NUEVO GRUPO DE PERSONALIZACIÓN"}
        </span>
        {!onSaveContextChange && <button type="button" onClick={resetGroupForm} className="text-[10px] font-normal text-black hover:opacity-80 transition-opacity">Cancelar</button>}
      </div>
      <div className="space-y-1">
        <label className="block text-[9px] uppercase font-normal text-black">Título del grupo</label>
        <input value={groupForm.title} onChange={(e) => setGroupForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej.: Proteínas, toppings extra" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-black bg-white focus:outline-none placeholder:text-black/40" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[9px] uppercase font-normal text-black">Modo de consumo</label>
          {groupForm.quantityMode === "NO_QUANTITY" ? <div className="w-full px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs font-normal text-amber-800 bg-amber-50">Configuración histórica</div> : <select value={groupForm.quantityMode} onChange={(e) => setGroupForm((p) => ({ ...p, quantityMode: e.target.value as QuantityMode }))} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-black bg-white focus:outline-none cursor-pointer"><option value="FIXED_PER_OPTION">{translateQuantityMode("FIXED_PER_OPTION")}</option><option value="SHARED_TOTAL">{translateQuantityMode("SHARED_TOTAL")}</option></select>}
        </div>
        <div className="flex items-end"><label className="flex w-full h-[34px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-black cursor-pointer select-none"><input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm((p) => ({ ...p, required: e.target.checked, minSelections: e.target.checked && p.minSelections === "0" ? "1" : p.minSelections }))} className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0b3f64] cursor-pointer" />Obligatorio</label></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><label className="block text-[9px] uppercase font-normal text-black">Selecciones mínimas</label><QuantityStepper value={Number(groupForm.minSelections || 0)} onChange={(value) => setGroupForm((p) => ({ ...p, minSelections: String(value) }))} min={0} step={1} precision={0} ariaLabel="Selecciones mínimas" /></div>
        <div className="space-y-1"><label className="block text-[9px] uppercase font-normal text-black">Selecciones máximas</label><QuantityStepper value={Number(groupForm.maxSelections || 0)} onChange={(value) => setGroupForm((p) => ({ ...p, maxSelections: value === 0 ? "" : String(value) }))} min={0} step={1} precision={0} ariaLabel="Selecciones máximas" /></div>
      </div>
      {groupForm.quantityMode === "SHARED_TOTAL" && <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200"><div className="space-y-1"><label className="block text-[9px] uppercase font-normal text-black">Cantidad total compartida</label><QuantityStepper value={Number(groupForm.totalQuantityLimit.replace(",", ".")) || 0} onChange={(value) => setGroupForm((p) => ({ ...p, totalQuantityLimit: String(value) }))} min={0.000001} step={0.1} precision={6} ariaLabel="Cantidad total compartida" /></div><div className="space-y-1"><label className="block text-[9px] uppercase font-normal text-black">Unidad de medida</label><select value={groupForm.totalQuantityUnitId} onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityUnitId: e.target.value }))} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-black bg-white focus:outline-none cursor-pointer"><option value="">Seleccionar unidad...</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol || unit.name} ({unit.name})</option>)}</select></div></div>}
      <div className={cn("sticky bottom-0 -mx-3.5 mt-4 gap-2 border-t border-slate-200 bg-white px-3.5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:p-0 md:border-0", onSaveContextChange ? "hidden" : "flex")}><button type="button" onClick={resetGroupForm} disabled={savingGroup} className="min-h-10 flex-1 rounded-lg border border-slate-200 text-xs font-medium text-black">Cancelar</button><button type="button" onClick={saveGroup} disabled={savingGroup} className="min-h-10 flex-1 rounded-lg bg-[#0B3F64] text-xs font-medium text-white disabled:opacity-60">{savingGroup ? "Guardando..." : "Guardar grupo"}</button></div>
    </div>
  );

  const renderOptionForm = ({ group, mode }: { group: any; mode: "create" | "edit" }) => {
    const form = optionFormFor(group);
    const query = (ingredientSearch[group.id] || "").toLowerCase();
    const filteredIngredients = allIngredients.filter((ingredient) => ingredient.name.toLowerCase().includes(query));
    const filteredItems = items.filter((target) => target.name.toLowerCase().includes(query));
    const selectedIngredient = form.targetType === "INGREDIENT" ? allIngredients.find((ingredient) => ingredient.id === form.ingredientId) : null;
    const hasIncompatibleUnit = Boolean(group.quantityMode === "SHARED_TOTAL" && selectedIngredient?.stockUnitId && group.totalQuantityUnitId && !areUnitsCompatible(selectedIngredient.stockUnitId, group.totalQuantityUnitId));
    const duplicateError = group.options.some((option: any) => option.isActive && option.id !== editingOptionId && ((form.targetType === "INGREDIENT" && option.targetType === "INGREDIENT" && option.ingredientId === form.ingredientId) || (form.targetType === "ITEM" && option.targetType === "ITEM" && option.itemId === form.itemId))) ? "Este recurso ya está agregado en este grupo." : null;
    const unitForIngredient = () => {
      const unit = selectedIngredient ? units.find((candidate) => candidate.id === selectedIngredient.stockUnitId) : null;
      return unit?.symbol || unit?.name || "—";
    };
    return <div className="rounded-xl border-2 border-[#0b3f64] bg-white p-3.5 space-y-3 mt-2.5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2"><span className="text-[10px] font-normal uppercase tracking-wide text-black block">{mode === "edit" ? "EDITAR OPCIÓN" : "+ AÑADIR OPCIÓN"}</span>{!onSaveContextChange && <button type="button" onClick={() => cancelEditOption(group)} className="text-[10px] font-normal text-black hover:opacity-80 transition-opacity">Cancelar</button>}</div>
      <div className="relative space-y-1"><label className="block text-[9px] uppercase font-normal text-black">{group.quantityMode === "SHARED_TOTAL" ? "INSUMO" : "RECURSO"}</label><div className="relative"><input type="text" value={ingredientSearch[group.id] || ""} onFocus={() => setIngredientDropdownOpen((previous) => ({ ...previous, [group.id]: true }))} onChange={(event) => { setIngredientSearch((previous) => ({ ...previous, [group.id]: event.target.value })); setIngredientDropdownOpen((previous) => ({ ...previous, [group.id]: true })); }} placeholder={group.quantityMode === "SHARED_TOTAL" ? "Buscar insumo..." : "Buscar insumo o producto simple..."} className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-black bg-white focus:outline-none placeholder:text-black/40" /><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-black/50" /></div>
        {ingredientDropdownOpen[group.id] && <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{filteredIngredients.map((ingredient) => <button key={`INGREDIENT:${ingredient.id}`} type="button" onClick={() => { setOptionForm(group.id, { ...form, targetType: "INGREDIENT", ingredientId: ingredient.id, itemId: "", name: ingredient.name, unitId: ingredient.stockUnitId || "", quantity: form.quantity || "1" }); setIngredientSearch((previous) => ({ ...previous, [group.id]: ingredient.name })); setIngredientDropdownOpen((previous) => ({ ...previous, [group.id]: false })); }} className="flex w-full items-center justify-between p-2 text-left text-xs font-normal text-black hover:bg-slate-50"><span>{ingredient.name}<span className="ml-1 text-[10px] text-black/60">Insumo</span></span><span className="text-[10px] text-black/60">Stock: {formatQuantity(ingredient.currentStock)} {unitLabel(ingredient.stockUnitId)}</span></button>)}{group.quantityMode === "FIXED_PER_OPTION" && filteredItems.map((target) => <button key={`ITEM:${target.id}`} type="button" onClick={() => { setOptionForm(group.id, { ...form, targetType: "ITEM", ingredientId: "", itemId: target.id, name: target.name, unitId: "", quantity: form.quantity || "1" }); setIngredientSearch((previous) => ({ ...previous, [group.id]: target.name })); setIngredientDropdownOpen((previous) => ({ ...previous, [group.id]: false })); }} className="flex w-full items-center justify-between p-2 text-left text-xs font-normal text-black hover:bg-slate-50"><span>{target.name}<span className="ml-1 text-[10px] text-black/60">Producto</span></span><span className="text-[10px] text-black/60">Stock: {formatQuantity(target.currentStock)} unidad</span></button>)}{filteredIngredients.length === 0 && (group.quantityMode !== "FIXED_PER_OPTION" || filteredItems.length === 0) && <div className="p-2 text-xs text-black/60 font-normal">No se encontraron resultados</div>}</div>}</div>
      <div className="space-y-1"><label className="block text-[9px] uppercase font-normal text-black">PRECIO DE ESTA OPCIÓN</label><input type="text" inputMode="decimal" value={form.priceDelta} onChange={(event) => setOptionForm(group.id, { ...form, priceDelta: event.target.value })} placeholder="0" className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-normal text-black bg-white focus:outline-none" /></div>
      <p className="text-[11px] font-normal text-black">{!form.priceDelta || Number(form.priceDelta) === 0 ? "Incluido en el precio base." : "Este valor se suma al precio base."}</p>
      {group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE" && <div className="flex gap-3 pt-1"><div className="flex-1"><label className="block text-[8px] uppercase font-normal text-black mb-1 leading-tight">CANTIDAD QUE<br />CONSUME</label><QuantityStepper value={Number(form.quantity || 1)} onChange={(value) => setOptionForm(group.id, { ...form, quantity: String(value) })} min={form.targetType === "ITEM" ? 1 : 0.000001} step={form.targetType === "ITEM" ? 1 : getStepAndPrecisionForUnit(unitForIngredient()).step} precision={form.targetType === "ITEM" ? 0 : getStepAndPrecisionForUnit(unitForIngredient()).precision} ariaLabel="Cantidad que consume" /></div><div className="flex-1"><label className="block text-[8px] uppercase font-normal text-black mb-1 leading-tight">UNIDAD BASE<br />(INSUMO)</label><div className="flex items-center px-2.5 border border-slate-200 rounded-lg h-7.5 bg-white text-xs font-normal text-black">{form.targetType === "INGREDIENT" ? unitForIngredient() : "unidad"}</div></div></div>}
      {hasIncompatibleUnit && <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs font-normal text-black"><AlertTriangle className="h-4 w-4 shrink-0 text-[#ff0041]" /><span>Este insumo usa una unidad incompatible con la del grupo.</span></div>}
      {duplicateError && <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs font-normal text-black"><AlertTriangle className="h-4 w-4 shrink-0 text-[#ff0041]" /><span>{duplicateError}</span></div>}
      <div className={cn("sticky bottom-0 -mx-3.5 mt-4 gap-2 border-t border-slate-200 bg-white px-3.5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:p-0 md:border-0", onSaveContextChange ? "hidden" : "flex")}><button type="button" onClick={() => cancelEditOption(group)} disabled={savingOption} className="min-h-10 flex-1 rounded-lg border border-slate-200 text-xs font-medium text-black">Cancelar</button><button type="button" disabled={savingOption || hasIncompatibleUnit || !!duplicateError} onClick={() => saveOption(group)} className="min-h-10 flex-1 rounded-lg bg-[#0B3F64] text-xs font-medium text-white disabled:opacity-60">{savingOption ? "Guardando..." : "Guardar opción"}</button></div>
    </div>;
  };

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-slate-100">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0b3f64]" />
            <h4 className="text-xs font-medium text-black uppercase tracking-wide">
              Grupos de personalización
            </h4>
          </div>
          <span className="text-[11px] text-black/60 font-normal">Opciones del cliente</span>
        </div>
      )}

      {/* Shared create form. Edits render this same component in the group's position. */}
      {showGroupForm && !editingGroupId && renderGroupForm({ mode: "create" })}
      {/* GROUPS LIST */}
      <div className="space-y-3">
        {!loading && groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-4 text-center">
            <h5 className="text-xs font-normal text-black">Sin grupos de personalización</h5>
            <p className="mt-0.5 text-[11px] font-normal text-black/60">
              Agregá opciones como tamaños, proteínas o toppings.
            </p>
            {!showGroupForm && (
              <button
                type="button"
                onClick={() => setShowGroupForm(true)}
                className="mt-2.5 inline-flex min-h-9 items-center justify-center rounded-lg bg-[#0b3f64] px-3.5 text-xs font-normal text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                + Crear primer grupo
              </button>
            )}
          </div>
        )}

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

          const selectedIngredient = form.targetType === "INGREDIENT" && form.ingredientId
            ? allIngredients.find((i) => i.id === form.ingredientId)
            : null;
          const hasIncompatibleUnit = !!(
            group.quantityMode === "SHARED_TOTAL" &&
            selectedIngredient?.stockUnitId &&
            group.totalQuantityUnitId &&
            !areUnitsCompatible(selectedIngredient.stockUnitId, group.totalQuantityUnitId)
          );

          const duplicateError = (() => {
            if (form.targetType === "INGREDIENT" && form.ingredientId) {
              const dup = group.options.some((o: any) =>
                o.isActive &&
                o.targetType === "INGREDIENT" &&
                o.ingredientId === form.ingredientId &&
                o.id !== editingOptionId
              );
              if (dup) return "Este insumo ya está agregado en este grupo.";
            }
            if (form.targetType === "ITEM" && form.itemId) {
              const dup = group.options.some((o: any) =>
                o.isActive &&
                o.targetType === "ITEM" &&
                o.itemId === form.itemId &&
                o.id !== editingOptionId
              );
              if (dup) return "Este producto ya está agregado en este grupo.";
            }
            if (form.targetType === "NONE" && form.name) {
              const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
              const normalizedInput = normalizeName(form.name);
              const dup = group.options.some((o: any) =>
                o.isActive &&
                o.targetType === "NONE" &&
                normalizeName(o.name) === normalizedInput &&
                o.id !== editingOptionId
              );
              if (dup) return "Ya existe una opción con ese nombre en este grupo.";
            }
            return null;
          })();
          const isExpanded = !!expandedGroupIds[group.id];
          const isOptionFormOpen = creatingOptionForGroupId === group.id;

          if (editingGroupId === group.id) {
            return renderGroupForm({ mode: "edit" });
            return (
              <div key={group.id} className="rounded-xl border-2 border-[#0b3f64] bg-white p-3.5 space-y-3 shadow-xs">
                <span className="text-[10px] font-medium uppercase tracking-wide text-black">Editar grupo</span>
                <input value={groupForm.title} onChange={(e) => setGroupForm((p) => ({ ...p, title: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-black" placeholder="Nombre del grupo" />
                {groupForm.quantityMode !== "NO_QUANTITY" && <select value={groupForm.quantityMode} onChange={(e) => setGroupForm((p) => ({ ...p, quantityMode: e.target.value as QuantityMode }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-black"><option value="FIXED_PER_OPTION">Cantidad por opción</option><option value="SHARED_TOTAL">Cantidad total compartida</option></select>}
                <div className="grid grid-cols-2 gap-2">
                  <QuantityStepper value={Number(groupForm.minSelections || 0)} onChange={(value) => setGroupForm((p) => ({ ...p, minSelections: String(value) }))} min={0} step={1} precision={0} ariaLabel="Mínimo" />
                  <QuantityStepper value={Number(groupForm.maxSelections || 0)} onChange={(value) => setGroupForm((p) => ({ ...p, maxSelections: value ? String(value) : "" }))} min={0} step={1} precision={0} ariaLabel="Máximo" />
                </div>
                <label className="flex items-center gap-2 text-xs text-black"><input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm((p) => ({ ...p, required: e.target.checked }))} /> Obligatorio</label>
                {groupForm.quantityMode === "SHARED_TOTAL" && <div className="grid grid-cols-2 gap-2"><QuantityStepper value={Number(groupForm.totalQuantityLimit.replace(",", ".")) || 0} onChange={(value) => setGroupForm((p) => ({ ...p, totalQuantityLimit: String(value) }))} min={0.000001} step={0.1} precision={6} ariaLabel="Cantidad total" /><select value={groupForm.totalQuantityUnitId} onChange={(e) => setGroupForm((p) => ({ ...p, totalQuantityUnitId: e.target.value }))} className="rounded-lg border border-slate-200 px-2 text-xs"><option value="">Unidad</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol || unit.name}</option>)}</select></div>}
              </div>
            );
          }

          return (
            <div
              key={group.id}
              className={cn(
                "bg-slate-50/60 border border-slate-200 border-l-4 border-l-[#ff9100] rounded-xl overflow-hidden transition shadow-2xs",
                !group.isActive && "opacity-75 bg-slate-50/5 border-dashed border-slate-200"
              )}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <h4 className="min-w-0 flex-1 truncate text-xs font-medium text-black sm:text-sm">{group.title}</h4>
                  <button type="button" onClick={() => editGroup(group)} aria-label="Editar grupo" title="Editar grupo" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#0b3f64] hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => deleteGroup(group)} aria-label="Quitar grupo" title="Quitar grupo" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#c80237] hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => toggleGroupExpanded(group.id)} aria-label={isExpanded ? "Contraer grupo" : "Expandir grupo"} title={isExpanded ? "Contraer grupo" : "Expandir grupo"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-black hover:bg-slate-100"><ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} /></button>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
                  {group.minSelections > 0 && <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-normal text-black">Mín. {group.minSelections}</span>}
                  {group.maxSelections !== null && <span className="rounded-full border border-orange-100 bg-[rgba(255,145,0,0.08)] px-2 py-0.5 text-[9px] font-normal text-black">Máx. {group.maxSelections}</span>}
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-normal text-black", group.required ? "border-red-100 bg-[rgba(255,0,65,0.08)]" : "border-slate-200 bg-slate-100")}>{group.required ? "Obligatorio" : "Opcional"}</span>
                  {!group.isActive && <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-normal text-black">Inactivo</span>}
                  {group.quantityMode === "NO_QUANTITY" && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-normal text-amber-800">Configuración histórica</span>}
                  {group.quantityMode === "FIXED_PER_OPTION" && <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-normal text-[#0b3f64]">Cantidad por opción</span>}
                  {group.quantityMode === "SHARED_TOTAL" && <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-normal text-[#0b3f64]">{group.totalQuantityLimit != null && (unitObjectLabel(group.totalQuantityUnit) || unitLabel(group.totalQuantityUnitId)) ? `Total compartido · ${formatQuantity(group.totalQuantityLimit)} ${unitObjectLabel(group.totalQuantityUnit) || unitLabel(group.totalQuantityUnitId)}` : "Total compartido · Incompleto"}</span>}
                </div>
              </div>

              {isExpanded && (
                <div className="p-3 border-t border-slate-200 space-y-3 bg-white">
                  {/* OPTIONS LIST */}
                  {group.options.length > 0 && (
                    <div className="space-y-2">
                      {group.options.map((option: any) => {
                        let lowStock = false;
                        const costLabel = optionCostLabel(group, option);
                        const stockLabel = optionStockLabel(group, option);
                        const usesLabel = optionUsesLabel(group, option);
                        const priceDelta = toNumber(option.priceDelta);

                        if (option.targetType === "INGREDIENT") {
                          const ing = allIngredients.find((i) => i.id === option.ingredientId);
                          if (ing) {
                            const stockNum = Number(ing.currentStock || 0);
                            let limit = 1;
                            if (group.quantityMode === "SHARED_TOTAL") {
                              limit = group.totalQuantityLimit ? Number(group.totalQuantityLimit) : 1;
                            } else if (group.quantityMode === "FIXED_PER_OPTION") {
                              limit = option.quantity ? Number(option.quantity) : 1;
                            }
                            lowStock = stockNum < limit;
                          }
                        }

                        if (editingOptionId === option.id) {
                          return renderOptionForm({ group, mode: "edit" });
                          return (
                            <div key={option.id} className="rounded-xl border-2 border-[#0b3f64] bg-white p-3.5 space-y-3">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-black">Editar opción</span>
                              <p className="truncate text-sm text-black">{form.name || option.name}</p>
                              <label className="block text-[10px] text-black">Precio adicional<input type="text" inputMode="decimal" value={form.priceDelta} onChange={(e) => setOptionForm(group.id, { ...form, priceDelta: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
                              {group.quantityMode === "FIXED_PER_OPTION" && form.targetType !== "NONE" && <QuantityStepper value={Number(form.quantity || 1)} onChange={(value) => setOptionForm(group.id, { ...form, quantity: String(value) })} min={form.targetType === "ITEM" ? 1 : 0.000001} step={form.targetType === "ITEM" ? 1 : 0.1} precision={form.targetType === "ITEM" ? 0 : 6} ariaLabel="Cantidad que consume" />}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={option.id}
                            className={cn(
                              "bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-xs font-normal transition",
                              !option.isActive && "opacity-60 bg-slate-50/30 border-dashed border-slate-200",
                              lowStock && option.isActive && "border-amber-200 bg-amber-50/20"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={cn("font-medium text-xs sm:text-sm text-black truncate", !option.isActive && "line-through text-black/50")}>
                                    {option.name}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] font-normal px-1.5 py-0.5 rounded border text-black",
                                    option.targetType === "INGREDIENT"
                                      ? "bg-[rgba(0,150,61,0.08)] border-green-100"
                                      : option.targetType === "ITEM"
                                        ? "bg-[rgba(11,63,100,0.08)] border-blue-100"
                                        : "bg-slate-100 border-slate-200"
                                  )}>
                                    {option.targetType === "INGREDIENT" ? "Ingrediente" : option.targetType === "ITEM" ? "Producto" : "Sin recurso"}
                                  </span>
                                  {option.selectedByDefault && (
                                    <span className="rounded bg-[#0b3f64] px-1.5 py-0.5 text-[8px] font-normal text-white uppercase tracking-wider">
                                      Default
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => editOption(group, option)}
                                  className="p-1 text-black hover:opacity-70 transition-opacity"
                                  aria-label="Editar opción"
                                  title="Editar opción"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-black" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteOption(group, option.id)}
                                  className="p-1 text-black hover:text-[#ff0041] transition-colors"
                                  aria-label="Quitar opción"
                                  title="Quitar opción"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-[#ff0041]" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 mt-2 border-t border-slate-200/60 text-[11px] text-black font-normal">
                              <div>
                                <span className="text-black/60 block text-[10px]">Costo selección</span>
                                <span className="text-black font-normal">{costLabel}</span>
                              </div>
                              <div>
                                <span className="text-black/60 block text-[10px]">Precio extra</span>
                                <span className="text-black font-normal">
                                  {priceDelta > 0 ? `+$${formatMoney(priceDelta)}` : "$0"}
                                </span>
                              </div>
                              <div>
                                <span className="text-black/60 block text-[10px]">Stock</span>
                                {stockLabel}
                              </div>
                              <div>
                                <span className="text-black/60 block text-[10px]">Producciones</span>
                                <span className="font-normal text-black">{usesLabel} disp.</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {group.options.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3 text-center">
                      <p className="text-xs font-normal text-black">Este grupo todavía no tiene opciones.</p>
                    </div>
                  )}

                  {group.quantityMode !== "NO_QUANTITY" && !isOptionFormOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingOptionForGroupId(group.id);
                        setEditingOptionId(null);
                      }}
                      className="w-full py-2.5 border border-dashed border-[#0b3f64] bg-[rgba(11,63,100,0.05)] hover:bg-blue-50 text-[#0b3f64] font-normal text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#0b3f64]" />
                      <span>{group.options.length === 0 ? "+ Añadir primera opción" : "+ AÑADIR OPCIÓN"}</span>
                    </button>
                  )}

                  {/* The same form is used for create and the inline edit above. */}
                  {isOptionFormOpen && !editingOptionId && renderOptionForm({ group, mode: "create" })}
                </div>
              )}
            </div>
          );
        })}
        {!showGroupForm && groups.length > 0 && (
          <button
            type="button"
            onClick={() => setShowGroupForm(true)}
            className="w-full py-2.5 bg-white hover:bg-slate-50 border border-dashed border-[#0b3f64] text-[#0b3f64] font-normal text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4 text-[#0b3f64]" />
            <span>+ Añadir nuevo grupo de personalización</span>
          </button>
        )}
      </div>
    </div>
  );
}
