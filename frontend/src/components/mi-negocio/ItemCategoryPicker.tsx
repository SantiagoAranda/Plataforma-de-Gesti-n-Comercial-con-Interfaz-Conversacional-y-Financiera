"use client";
import { useState } from "react";
import { ItemCatalogAttributes } from "@/src/types/item";
import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from "@/src/lib/itemCategories";

export function ItemCategoryPicker({ value, onChange }: {
  value: ItemCatalogAttributes; onChange: (value: ItemCatalogAttributes) => void;
}) {
  const [step, setStep] = useState<"closed" | "category" | "subcategory">("closed");
  const category = ITEM_CATEGORIES.find(entry => entry.id === value.categoryId);
  const label = value.categoryId === OTHER_CATEGORY_ID ? value.customCategoryName || "Otra categoría" : category?.label;
  const subLabel = category?.subcategories.find(entry => entry.id === value.subcategoryId)?.label || value.customSubcategoryName;
  const selectCategory = (id: string | null) => {
    onChange({ ...value, categoryId: id, subcategoryId: null, customCategoryName: null, customSubcategoryName: null });
    setStep(id ? "subcategory" : "closed");
  };
  return <section className="space-y-3" aria-label="Categoría">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoría</h3>
    <button type="button" aria-expanded={step !== "closed"} onClick={() => setStep("category")}
      className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-left text-sm">
      <span className="block font-semibold">{label || "Elegir categoría"}</span>
      <span className="text-xs text-slate-500">{subLabel || (label ? "Sin subcategoría" : "28 categorías y Otra categoría")}</span>
    </button>
    {step !== "closed" && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" role="group" aria-label="Selector de categoría">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{step === "category" ? "1. Elige una categoría" : "2. Subcategoría opcional"}</h4>
        <button type="button" onClick={() => setStep("closed")} className="rounded-lg p-2 text-xs">Cerrar</button>
      </div>
      {step === "category" ? <>
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
          {ITEM_CATEGORIES.map(entry => <button type="button" key={entry.id} onClick={() => selectCategory(entry.id)}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left text-xs hover:border-sky-700">
            {entry.label}<span className="mt-1 block text-slate-400">{entry.subcategories.length} opciones</span>
          </button>)}
          <button type="button" onClick={() => selectCategory(OTHER_CATEGORY_ID)} className="rounded-xl border border-dashed border-sky-700 bg-white p-3 text-xs">Otra categoría</button>
        </div>
        <button type="button" onClick={() => selectCategory(null)} className="p-2 text-sm text-slate-600">Sin categoría</button>
      </> : <>
        <button type="button" onClick={() => setStep("category")} className="text-sm text-sky-800">← Cambiar categoría</button>
        {value.categoryId === OTHER_CATEGORY_ID ? <div className="space-y-3">
          <label className="block text-sm">Nombre de categoría
            <input value={value.customCategoryName ?? ""} maxLength={60} onChange={e => onChange({ ...value, customCategoryName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3" />
          </label>
          <label className="block text-sm">Subcategoría personalizada (opcional)
            <input value={value.customSubcategoryName ?? ""} maxLength={60} onChange={e => onChange({ ...value, customSubcategoryName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3" />
          </label>
          <button type="button" onClick={() => setStep("closed")} className="rounded-xl bg-[#0B3F64] px-4 py-2 text-sm text-white">Listo</button>
        </div> : <>
          <p className="text-sm font-medium">{category?.label}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {category?.subcategories.map(sub => <button type="button" key={sub.id}
              onClick={() => { onChange({ ...value, subcategoryId: sub.id }); setStep("closed"); }}
              className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-sm">{sub.label}</button>)}
          </div>
          <button type="button" onClick={() => { onChange({ ...value, subcategoryId: null }); setStep("closed"); }}
            className="p-2 text-sm text-sky-800">Usar categoría sin subcategoría</button>
        </>}
      </>}
    </div>}
  </section>;
}
