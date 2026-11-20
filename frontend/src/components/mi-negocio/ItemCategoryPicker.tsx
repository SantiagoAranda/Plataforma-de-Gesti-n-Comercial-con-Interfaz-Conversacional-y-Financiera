"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Backpack, Baby, BookOpen, BrushCleaning, Car, Check, ChevronRight, CircleCheck, CircleSlash, Cloud, CookingPot,
  Dumbbell, Ellipsis, Footprints, Gem, Gift, Guitar, HardHat, HeartPulse, Palette, PawPrint, PencilRuler, PersonStanding,
  Plug, Puzzle, Search, Shirt, Smartphone, Sofa, Sprout, Tags, Tent, Utensils, WandSparkles, Wrench, X, type LucideIcon,
} from "lucide-react";
import { ItemCatalogAttributes } from "@/src/types/item";
import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from "@/src/lib/itemCategories";

// Frontend-only: kept out of ITEM_CATEGORIES so the backend parity test stays intact.
// lucide equivalents of the prototype's CAT_ICONS (Font Awesome); person-dress and child have no exact match.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "alimentos-y-bebidas": Utensils, "electronica-y-tecnologia": Smartphone, "electrodomesticos": Plug,
  "hogar-y-muebles": Sofa, "cocina-y-menaje": CookingPot, "aseo-y-limpieza": BrushCleaning, "moda-mujer": PersonStanding,
  "moda-hombre": Shirt, "moda-infantil": Backpack, "calzado": Footprints, "accesorios-y-joyeria": Gem,
  "belleza-y-cuidado-personal": WandSparkles, "salud-y-bienestar": HeartPulse, "bebes-y-maternidad": Baby,
  "juguetes-y-juegos": Puzzle, "deportes-y-fitness": Dumbbell, "camping-y-aventura": Tent, "automotriz-y-motos": Car,
  "herramientas-y-ferreteria": Wrench, "jardin-y-exteriores": Sprout, "mascotas": PawPrint, "papeleria-y-oficina": PencilRuler,
  "libros-musica-y-peliculas": BookOpen, "instrumentos-musicales": Guitar, "arte-y-manualidades": Palette,
  "fiestas-y-regalos": Gift, "industria-y-seguridad": HardHat, "digital-y-servicios": Cloud, [OTHER_CATEGORY_ID]: Ellipsis,
};
const HUES = [28, 215, 275, 150, 340, 190, 45, 250, 10, 170, 95, 320];
const norm = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function CategoryTile({ id, size = "h-11 w-11", iconSize = 20 }: { id: string | null; size?: string; iconSize?: number }) {
  const index = ITEM_CATEGORIES.findIndex(entry => entry.id === id);
  const Icon = id ? CATEGORY_ICONS[id] ?? Tags : CircleSlash;
  const style = index < 0 ? { background: "#f1f5f9", color: "#475569" }
    : { background: `hsl(${HUES[index % HUES.length]} 85% 94%)`, color: `hsl(${HUES[index % HUES.length]} 62% 34%)` };
  return <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-xl ${size}`} style={style}><Icon size={iconSize} /></span>;
}

function StepPill({ n, label, detail, active, done, onClick }: {
  n: number; label: string; detail: string; active: boolean; done: boolean; onClick?: () => void;
}) {
  return <button type="button" onClick={onClick} disabled={!onClick} aria-current={active ? "step" : undefined}
    className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${active ? "border-[#0B3F64] bg-sky-50" : "border-slate-200 bg-white"} disabled:opacity-50`}>
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-[#0B3F64] text-white" : "bg-slate-200 text-slate-500"}`}>
      {done ? <Check size={11} strokeWidth={3} aria-label="Completado" /> : n}
    </span>
    <span className="min-w-0">
      <span className={`block text-[11px] font-bold ${active ? "text-[#0B3F64]" : "text-slate-500"}`}>{label}</span>
      <span className="block truncate text-[10px] text-slate-400">{detail}</span>
    </span>
  </button>;
}

export function ItemCategoryPicker({ value, onChange }: {
  value: ItemCatalogAttributes; onChange: (value: ItemCatalogAttributes) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [draftCat, setDraftCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [customSub, setCustomSub] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const category = ITEM_CATEGORIES.find(entry => entry.id === value.categoryId);
  const isOther = value.categoryId === OTHER_CATEGORY_ID;
  const label = isOther ? value.customCategoryName || "Otra categoría" : category?.label;
  const subLabel = category?.subcategories.find(entry => entry.id === value.subcategoryId)?.label || value.customSubcategoryName;
  const draft = ITEM_CATEGORIES.find(entry => entry.id === draftCat);
  const draftLabel = draftCat === OTHER_CATEGORY_ID ? "Otra categoría" : draft?.label;

  const goStep = (next: 1 | 2) => { setStep(next); setQuery(""); };
  const openPicker = () => {
    setDraftCat(value.categoryId ?? null); setCustomCat(value.customCategoryName ?? ""); setCustomSub(value.customSubcategoryName ?? "");
    goStep(1); setOpen(true);
  };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const commit = (next: Pick<ItemCatalogAttributes, "categoryId" | "subcategoryId" | "customCategoryName" | "customSubcategoryName">) => {
    onChange({ ...value, ...next }); close();
  };
  const pickCategory = (id: string) => {
    if (id !== draftCat) { setCustomCat(""); setCustomSub(""); }
    setDraftCat(id); goStep(2);
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  // Focus the dialog, not the search box, so the mobile keyboard does not cover the grid; also re-anchors focus when a step unmounts the clicked button.
  useEffect(() => { if (open) panelRef.current?.focus(); }, [open, step]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); close(); return; }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const q = norm(query);
  const categories = ITEM_CATEGORIES.filter(entry => !q || norm(entry.label).includes(q));
  const subcategories = draft?.subcategories.filter(entry => !q || norm(entry.label).includes(q)) ?? [];
  const showOther = step === 2 && draftCat === OTHER_CATEGORY_ID;
  const emptyState = <p className="py-8 text-center text-sm text-slate-500">Sin resultados para «{query}»</p>;
  const card = "relative flex flex-col items-center justify-start gap-2 rounded-2xl border px-1.5 pb-2.5 pt-3 text-center transition-colors active:scale-95";

  return <section className="space-y-1.5" aria-label="Categoría">
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Categoría</h3>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}
      className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 text-left transition-colors hover:border-slate-400">
      {label ? <CategoryTile id={value.categoryId ?? null} /> :
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Tags size={18} /></span>}
      <span className="min-w-0 flex-1">
        {label ? <>
          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
          <span className="block truncate text-sm font-semibold text-slate-800">{subLabel || "Sin subcategoría"}</span>
        </> : <>
          <span className="block text-sm font-semibold text-slate-700">Elegir categoría</span>
          <span className="block text-[11px] text-slate-400">{ITEM_CATEGORIES.length} categorías · con búsqueda rápida</span>
        </>}
      </span>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-slate-300" />
    </button>

    {open && createPortal(<div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden className="animate-fadeIn absolute inset-0 bg-black/50" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} tabIndex={-1}
        className="animate-slideUp relative outline-none flex h-[90dvh] w-full flex-col rounded-t-[32px] bg-white shadow-2xl motion-reduce:animate-none sm:h-[85vh] sm:max-w-lg sm:rounded-[32px]">
        <div className="flex shrink-0 justify-center pb-1 pt-2.5"><span className="h-1 w-10 rounded-full bg-slate-200" /></div>
        <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-1">
          {step === 2 && <button type="button" onClick={() => goStep(1)} aria-label="Volver a categorías"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><ArrowLeft size={16} /></button>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-900">{step === 1 ? "Elegir una categoría" : showOther ? "Categoría personalizada" : "Elegir una subcategoría"}</h2>
            <p className="truncate text-[11px] text-slate-400">{step === 1 ? "Toca una para ver sus subcategorías" : draftLabel}</p>
          </div>
          <button type="button" onClick={close} aria-label="Cerrar selector de categoría"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
        </div>

        <div className="flex shrink-0 items-center gap-2 px-5 pb-3">
          <StepPill n={1} label="Categoría" detail={draftLabel ?? "Sin elegir"} active={step === 1} done={step === 2 && !!draftCat} onClick={() => goStep(1)} />
          <ChevronRight size={12} aria-hidden className="shrink-0 text-slate-300" />
          <StepPill n={2} label="Subcategoría" active={step === 2} done={false}
            detail={(draftCat === value.categoryId && subLabel) || "Sin elegir"} onClick={draftCat ? () => goStep(2) : undefined} />
        </div>

        {!showOther && <div className="shrink-0 px-5 pb-3">
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)}
              aria-label={step === 1 ? "Buscar categoría" : "Buscar subcategoría"}
              placeholder={step === 1 ? "Buscar categoría…" : `Filtrar en ${draftLabel ?? ""}…`}
              className="w-full rounded-2xl border border-transparent bg-slate-100 py-3 pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white" />
          </div>
        </div>}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {step === 1 ? <>
            {!q && <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Todas las categorías <span className="text-slate-300">· {ITEM_CATEGORIES.length}</span></p>}
            {q && !categories.length ? emptyState : <div className="grid grid-cols-3 gap-2">
              {!q && <button type="button" onClick={() => commit({ categoryId: null, subcategoryId: null, customCategoryName: null, customSubcategoryName: null })}
                className={`${card} ${!value.categoryId ? "border-[#0B3F64] bg-sky-50 ring-1 ring-[#0B3F64]" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <CategoryTile id={null} />
                <span className="text-[11px] font-bold leading-tight text-slate-800">Sin categoría</span>
              </button>}
              {categories.map(entry => {
                const selected = entry.id === draftCat;
                return <button type="button" key={entry.id} onClick={() => pickCategory(entry.id)} aria-pressed={selected}
                  className={`${card} ${selected ? "border-[#0B3F64] bg-sky-50 ring-1 ring-[#0B3F64]" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  {selected && <span aria-hidden className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0B3F64] text-white"><Check size={10} strokeWidth={3} /></span>}
                  <CategoryTile id={entry.id} />
                  <span className="text-[11px] font-bold leading-tight text-slate-800">{entry.label}</span>
                  <span className="text-[10px] text-slate-400">{entry.subcategories.length} opciones</span>
                </button>;
              })}
              {!q && <button type="button" onClick={() => pickCategory(OTHER_CATEGORY_ID)} aria-pressed={draftCat === OTHER_CATEGORY_ID}
                className={`${card} border-dashed ${draftCat === OTHER_CATEGORY_ID ? "border-[#0B3F64] bg-sky-50" : "border-slate-300 bg-white hover:border-slate-400"}`}>
                <CategoryTile id={OTHER_CATEGORY_ID} />
                <span className="text-[11px] font-bold leading-tight text-slate-800">Otra categoría</span>
                <span className="text-[10px] text-slate-400">Escríbela tú</span>
              </button>}
            </div>}
          </> : showOther ? <div className="space-y-4 pt-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Nombre de categoría
              <input value={customCat} maxLength={60} onChange={e => setCustomCat(e.target.value)} placeholder="Ej: Repuestos de bicicleta"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Subcategoría personalizada (opcional)
              <input value={customSub} maxLength={60} onChange={e => setCustomSub(e.target.value)} placeholder="Ej: Accesorios"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-slate-400" />
            </label>
            <button type="button" disabled={!customCat.trim()}
              onClick={() => commit({ categoryId: OTHER_CATEGORY_ID, subcategoryId: null, customCategoryName: customCat.trim(), customSubcategoryName: customSub.trim() || null })}
              className="w-full rounded-2xl bg-[#0B3F64] py-3.5 text-sm font-bold text-white disabled:opacity-50">Listo</button>
          </div> : <>
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <CategoryTile id={draftCat} size="h-10 w-10" iconSize={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{draftLabel}</span>
                <span className="block text-[11px] text-slate-400">{draft?.subcategories.length} subcategorías</span>
              </span>
              <button type="button" onClick={() => goStep(1)} className="rounded-full px-2.5 py-1.5 text-[11px] font-bold text-[#0B3F64] hover:bg-sky-100">Cambiar</button>
            </div>
            {q && !subcategories.length ? emptyState : <div className="space-y-1.5">
              {subcategories.map(sub => {
                const selected = value.categoryId === draftCat && value.subcategoryId === sub.id;
                return <button type="button" key={sub.id} aria-pressed={selected}
                  onClick={() => commit({ categoryId: draftCat, subcategoryId: sub.id, customCategoryName: null, customSubcategoryName: null })}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${selected ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                  <span aria-hidden className="ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{sub.label}</span>
                  {selected ? <CircleCheck size={18} aria-hidden className="text-[#0B3F64]" /> : <ChevronRight size={14} aria-hidden className="text-slate-300" />}
                </button>;
              })}
            </div>}
            {!q && <button type="button" onClick={() => commit({ categoryId: draftCat, subcategoryId: null, customCategoryName: null, customSubcategoryName: null })}
              className="mt-3 w-full py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
              Usar solo «{draftLabel}», sin subcategoría
            </button>}
          </>}
        </div>
      </div>
    </div>, document.body)}
  </section>;
}
