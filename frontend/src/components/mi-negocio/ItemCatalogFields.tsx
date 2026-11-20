"use client";
import { ItemCatalogAttributes, ItemType } from "@/src/types/item";
import { publicPriceLabel } from "@/src/lib/publicCatalog";
import { ItemCategoryPicker } from "./ItemCategoryPicker";

export function ItemCatalogFields({ value, onChange, name, price, type, error }: {
  value: ItemCatalogAttributes; onChange: (value: ItemCatalogAttributes) => void;
  name: string; price: number | null; type: ItemType; error: string | null;
}) {
  const description = value.quotationDescription ?? "";
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-500">Marca
        <input value={value.brand ?? ""} maxLength={80} onChange={e => onChange({ ...value, brand: e.target.value })}
          className="mt-1 block w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900" />
      </label>
      <label className="text-xs font-medium text-slate-500">Código de barras manual
        <input type="text" value={value.barcode ?? ""} maxLength={64} onChange={e => onChange({ ...value, barcode: e.target.value })}
          className="mt-1 block w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900" />
      </label>
    </div>
    <ItemCategoryPicker value={value} onChange={onChange} />
    <section className="space-y-3 rounded-2xl border border-sky-200 p-4">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Incluir en cotización
        <input type="checkbox" checked={value.includeInQuotation ?? false}
          onChange={e => onChange({ ...value, includeInQuotation: e.target.checked })} className="h-5 w-5 accent-sky-800" />
      </label>
      {value.includeInQuotation && <>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="quotation-description" className="text-xs text-slate-500">Descripción para cotización</label>
          <button type="button" onClick={() => onChange({ ...value, quotationDescription: name.slice(0, 400) })}
            className="text-xs text-sky-800">Usar nombre</button>
        </div>
        <textarea id="quotation-description" value={description} maxLength={400} rows={3}
          onChange={e => onChange({ ...value, quotationDescription: e.target.value })}
          className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm" />
        <p className="text-right text-xs text-slate-400">{description.length}/400</p>
        <div className="flex flex-wrap gap-2">
          {["Incluye", "Medidas", "Garantía", "Entrega"].map(text => <button type="button" key={text}
            onClick={() => onChange({ ...value, quotationDescription: (description + (description ? "\n" : "") + text + ": ").slice(0, 400) })}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs">+ {text}</button>)}
        </div>
        <div aria-label="Vista previa de cotización" className="space-y-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Vista previa local · {type === "PRODUCT" ? "Producto" : "Servicio"}</p>
          <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
            <span>{name || "Nombre del ítem"}</span>
            <span className="text-sky-800">{value.publishWithoutPrice ? "Consultar precio" : price == null ? "Precio pendiente" : publicPriceLabel(price)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{description || "Aquí aparecerá tu descripción."}</p>
        </div>
        <p className="text-xs text-slate-500">Esta vista previa no crea ni envía una cotización.</p>
      </>}
    </section>
    <section className="space-y-3" aria-label="Visibilidad">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visibilidad</h3>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm">
        No mostrar en catálogo
        <input type="checkbox" checked={value.visibleInCatalog === false} className="h-5 w-5 accent-sky-800"
          onChange={e => onChange({ ...value, visibleInCatalog: !e.target.checked })} />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm">
        Publicar sin precio
        <input type="checkbox" checked={value.publishWithoutPrice ?? false} className="h-5 w-5 accent-sky-800"
          onChange={e => onChange({ ...value, publishWithoutPrice: e.target.checked })} />
      </label>
      <p className="text-xs text-slate-500">El precio interno se conserva. Ocultar del catálogo no desactiva el ítem.</p>
    </section>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
