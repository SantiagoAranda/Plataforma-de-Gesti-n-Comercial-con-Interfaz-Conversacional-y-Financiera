"use client";
import { useId, useState } from "react";
import { Eye, EyeOff, FileText, Tag, Trash2, WandSparkles, type LucideIcon } from "lucide-react";
import { ItemCatalogAttributes, ItemType } from "@/src/types/item";
import { publicPriceLabel } from "@/src/lib/publicCatalog";
import { isValidBarcode } from "@/src/lib/itemForm";
import { ItemCategoryPicker } from "./ItemCategoryPicker";

const MAX_QUOTE = 400;

/** Row with icon tile, title, dynamic hint and an animated switch (native checkbox, keyboard accessible). */
function SwitchRow({ icon: Icon, title, hint, checked, onChange, strong = false }: {
  icon: LucideIcon; title: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; strong?: boolean;
}) {
  const hintId = useId();
  const tile = checked ? (strong ? "bg-[#0B3F64] text-white" : "bg-sky-100 text-[#0B3F64]") : "bg-slate-100 text-slate-400";
  return <label className="flex min-h-[64px] cursor-pointer select-none items-center gap-3 px-3 py-3">
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${tile}`}><Icon size={18} aria-hidden /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-800">{title}</span>
      <span id={hintId} className="block text-[11px] leading-snug text-slate-500">{hint}</span>
    </span>
    <span className="relative shrink-0">
      <input type="checkbox" role="switch" aria-label={title} aria-describedby={hintId} checked={checked}
        onChange={e => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="block h-6 w-11 rounded-full bg-slate-300 transition-colors duration-200 peer-checked:bg-[#0B3F64] peer-focus-visible:ring-2 peer-focus-visible:ring-sky-300 peer-focus-visible:ring-offset-2" />
      <span aria-hidden className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-5 motion-reduce:transition-none" />
    </span>
  </label>;
}

export function ItemCatalogFields({ value, onChange, name, price, type, error }: {
  value: ItemCatalogAttributes; onChange: (value: ItemCatalogAttributes) => void;
  name: string; price: number | null; type: ItemType; error: string | null;
}) {
  const description = value.quotationDescription ?? "";
  const quoteOn = value.includeInQuotation ?? false;
  const hidden = value.visibleInCatalog === false;
  const noPrice = value.publishWithoutPrice ?? false;
  const setDescription = (text: string) => onChange({ ...value, quotationDescription: text.slice(0, MAX_QUOTE) });
  // Brand/barcode stay in the payload but out of the UI; an invalid saved barcode is shown so it can be fixed or removed.
  const [showBarcode, setShowBarcode] = useState(false);
  if (!showBarcode && !isValidBarcode(value.barcode)) setShowBarcode(true);

  return <div className="space-y-5">
    {showBarcode && <label className="block rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-xs font-medium text-amber-800">
      Código de barras guardado
      <input type="text" value={value.barcode ?? ""} maxLength={64} onChange={e => onChange({ ...value, barcode: e.target.value })}
        className="mt-1 block w-full rounded-xl border border-amber-200 bg-white p-3 text-sm text-slate-900" />
      <span className="mt-1 block font-normal">Este código no es válido: corrígelo (sin espacios, hasta 64 caracteres) o bórralo para poder guardar.</span>
    </label>}

    <ItemCategoryPicker value={value} onChange={onChange} />

    <section className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-300 ${quoteOn ? "border-[#0B3F64]" : "border-slate-200"}`}>
      <SwitchRow icon={FileText} strong title="Incluir en cotización" checked={quoteOn}
        hint={quoteOn ? "Esta descripción aparecerá en las cotizaciones" : "Activa para escribir la descripción que verá el cliente"}
        onChange={checked => onChange({ ...value, includeInQuotation: checked })} />
      {/* Collapsed with grid-rows so it animates; the text stays in state when switched off. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${quoteOn ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden" inert={!quoteOn}>
          <div className="space-y-3 px-3 pb-3 pt-1">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="quotation-description" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Descripción</label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setDescription("")} disabled={!description}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:pointer-events-none disabled:opacity-40">
                  <Trash2 size={12} aria-hidden />Limpiar
                </button>
                <button type="button" onClick={() => setDescription(name)}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-[#0B3F64] transition-colors hover:bg-sky-100">
                  <WandSparkles size={12} aria-hidden />Usar nombre
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-[#0B3F64] focus-within:bg-white">
              <textarea id="quotation-description" aria-label="Descripción para cotización" value={description} maxLength={MAX_QUOTE} rows={4}
                placeholder="Ej: Hamburguesa sencilla con carne de res 120 g, queso, lechuga y salsa de la casa. Incluye papas."
                onChange={e => setDescription(e.target.value)}
                className="block w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400" />
              <div className="flex items-center gap-2 px-4 pb-2.5">
                <div role="progressbar" aria-label="Caracteres usados en la descripción" aria-valuemin={0} aria-valuemax={MAX_QUOTE} aria-valuenow={description.length}
                  className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[#0B3F64] transition-[width] duration-200" style={{ width: `${(description.length / MAX_QUOTE) * 100}%` }} />
                </div>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">{description.length} / {MAX_QUOTE}</span>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Agregar rápido</span>
              <div className="flex flex-wrap gap-1.5">
                {["Incluye", "Medidas", "Garantía", "Entrega"].map(text => <button type="button" key={text}
                  onClick={() => setDescription(description + (description ? "\n" : "") + text + ": ")}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">+ {text}</button>)}
              </div>
            </div>
            <div role="group" aria-label="Vista previa de cotización" className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Eye size={12} aria-hidden />Así lo verá el cliente</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{type === "PRODUCT" ? "Producto" : "Servicio"}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className={`min-w-0 break-words text-sm font-bold ${name ? "text-slate-800" : "text-slate-300"}`}>{name || "Nombre del producto"}</p>
                  <p className={`whitespace-nowrap text-sm font-extrabold ${noPrice ? "text-amber-600" : "text-emerald-600"}`}>{noPrice ? "Consultar precio" : price == null ? "Precio pendiente" : publicPriceLabel(price)}</p>
                </div>
                <p className={`mt-1.5 whitespace-pre-wrap break-words text-xs leading-snug ${description ? "text-slate-600" : "italic text-slate-300"}`}>{description || "Aquí aparecerá la descripción que escribas…"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="space-y-1.5" aria-label="Visibilidad">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Visibilidad</h3>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <SwitchRow icon={hidden ? EyeOff : Eye} title="No mostrar en catálogo" checked={hidden}
          hint={hidden ? "Oculto: Solo tú lo ves en tu panel" : "Visible para tus clientes en el catálogo"}
          onChange={checked => onChange({ ...value, visibleInCatalog: !checked })} />
        <SwitchRow icon={Tag} title="Publicar sin precio" checked={noPrice}
          hint={noPrice ? "Los clientes verán \"Consultar precio\"" : "Se mostrará el precio en el catálogo"}
          onChange={checked => onChange({ ...value, publishWithoutPrice: checked })} />
      </div>
    </section>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
