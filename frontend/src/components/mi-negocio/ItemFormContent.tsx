"use client";

import { X, Clock, ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";
import {
  ItemType,
  ItemImage,
  PendingImage,
  WeeklySchedule,
  FormErrors,
  ItemInventoryMode,
} from "@/src/types/item";
import {
  formatPriceInput,
  parsePriceInput,
  rangesOverlap,
} from "@/src/lib/itemHelpers";
import {
  MAX_ITEM_IMAGES,
} from "@/src/lib/itemImages";

const BADGE_PRESET_COLORS = [
  { hex: "#EF4444", name: "Rojo" },
  { hex: "#10B981", name: "Verde" },
  { hex: "#3B82F6", name: "Azul" },
  { hex: "#FBBF24", name: "Amarillo" },
  { hex: "#F97316", name: "Naranja" },
  { hex: "#EC4899", name: "Rosa" },
];

function BadgeColorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const matchedPreset = BADGE_PRESET_COLORS.find(
    (c) => c.hex.toLowerCase() === value.toLowerCase()
  );

  return (
    <div className="relative">
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-neutral-100 bg-white px-3 text-xs font-semibold text-neutral-800 shadow-sm transition outline-none focus:border-[#0B3F64]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-xs"
            style={{ backgroundColor: value || "#EF4444" }}
          />
          <span className="truncate">
            {matchedPreset ? matchedPreset.name : (value ? value.toUpperCase() : "Color")}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* DROPDOWN MENU */}
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1.5 z-30 w-52 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {BADGE_PRESET_COLORS.map((preset) => {
                const isSelected = value.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => {
                      onChange(preset.hex);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition text-left ${
                      isSelected ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span className="flex-1 truncate">{preset.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#0B3F64] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="my-1.5 border-t border-neutral-100" />

            {/* CUSTOM HEX / COLOR PICKER */}
            <div className="p-1">
              <span className="block px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Personalizado
              </span>
              <div className="flex items-center gap-2">
                <label
                  className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-200 shadow-xs transition hover:scale-105"
                  style={{ backgroundColor: value || "#EF4444" }}
                  title="Abrir selector de color"
                >
                  <input
                    type="color"
                    value={value.startsWith("#") && value.length === 7 ? value : "#EF4444"}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                  />
                </label>
                <input
                  type="text"
                  placeholder="#FF5733"
                  maxLength={7}
                  value={value}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val && !val.startsWith("#")) {
                      val = `#${val}`;
                    }
                    const cleaned = val.replace(/[^#0-9a-fA-F]/g, "").slice(0, 7);
                    onChange(cleaned);
                  }}
                  className="h-8 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-mono font-medium text-neutral-800 outline-none focus:bg-white focus:border-[#0B3F64]"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Selector de hora en formato 12h AM/PM (Colombia).
// Recibe y emite strings en formato 24h ("14:30") para compatibilidad
// con el estado interno del formulario y la API.
// ────────────────────────────────────────────────────────────────────────
function TimeSelectAMPM({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const parts = value.split(":");
  const h24 = parseInt(parts[0] ?? "8", 10);
  const min = parseInt(parts[1] ?? "0", 10);
  const isPM = h24 >= 12;
  const h12 = h24 % 12 || 12;

  function emit(nh12: number, nm: number, nIsPM: boolean) {
    let h = nh12 === 12 ? 0 : nh12;
    if (nIsPM) h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
  }

  return (
    <div className={`flex items-center ${className ?? ""}`}>
      {/* Contenedor interno integrado */}
      <div className="flex items-center bg-gray-50 border border-gray-300 rounded-md px-1.5 py-1 focus-within:border-[#0B3F64]">
        <select
          value={h12}
          onChange={(e) => emit(Number(e.target.value), min, isPM)}
          className="w-7 text-center bg-transparent border-none outline-none p-0 text-sm appearance-none font-semibold cursor-pointer text-neutral-800"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
          ))}
        </select>

        <span className="text-gray-400 px-0.5 text-sm select-none font-semibold">:</span>

        <select
          value={min}
          onChange={(e) => emit(h12, Number(e.target.value), isPM)}
          className="w-7 text-center bg-transparent border-none outline-none p-0 text-sm appearance-none font-semibold cursor-pointer text-neutral-800"
        >
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
      </div>

      {/* Botón Selector AM/PM */}
      <button
        type="button"
        onClick={() => emit(h12, min, !isPM)}
        className={`ml-1.5 px-1 py-1 text-xs font-bold rounded border transition-all w-12 text-center cursor-pointer select-none active:scale-95
          ${isPM
            ? "bg-[#0B3F64]/10 border-[#0B3F64]/30 text-[#0B3F64] font-bold"
            : "bg-gray-100 border-gray-300 text-gray-500 font-bold"
          }`}
      >
        {isPM ? "PM" : "AM"}
      </button>
    </div>
  );
}

interface ItemFormContentProps {
  type: ItemType;
  setType: (type: ItemType) => void;
  inventoryMode: ItemInventoryMode;
  setInventoryMode: (mode: ItemInventoryMode) => void;
  name: string;
  setName: (name: string) => void;
  badgeText1: string;
  setBadgeText1: (val: string) => void;
  badgeColor1: string;
  setBadgeColor1: (val: string) => void;
  badgeText2: string;
  setBadgeText2: (val: string) => void;
  badgeColor2: string;
  setBadgeColor2: (val: string) => void;
  priceDisplay: string;
  setPriceDisplay: (val: string) => void;
  setPrice: (val: string) => void;
  appliesImpoconsumo: boolean;
  setAppliesImpoconsumo: (value: boolean) => void;
  impoconsumoRatePercent: string;
  setImpoconsumoRatePercent: (value: string) => void;
  durationInput: string;
  setDurationInput: (val: string) => void;
  setDuration: (val: number) => void;
  durationAdjustmentMessage: string | null;
  setDurationAdjustmentMessage: (msg: string | null) => void;
  week: WeeklySchedule[];
  setWeek: (week: WeeklySchedule[]) => void;
  currentDayIndex: number;
  setCurrentDayIndex: (idx: number) => void;
  existingImages: ItemImage[];
  newImages: PendingImage[];
  handleAddImages: (files: FileList | null) => void;
  handleRemoveExistingImage: (id: string) => void;
  handleRemoveNewImage: (id: string) => void;
  formErrors: FormErrors;
  setFormErrors: (updater: (prev: FormErrors) => FormErrors) => void;
  imageError: string | null;
  editingItem: boolean;
  saleConcept: "GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER";
  setSaleConcept: (concept: "GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER") => void;
}

export function ItemFormContent(props: ItemFormContentProps) {
  const {
    type,
    setType,
    inventoryMode,
    setInventoryMode,
    name,
    setName,
    badgeText1,
    setBadgeText1,
    badgeColor1,
    setBadgeColor1,
    badgeText2,
    setBadgeText2,
    badgeColor2,
    setBadgeColor2,
    priceDisplay,
    setPriceDisplay,
    setPrice,
    appliesImpoconsumo,
    setAppliesImpoconsumo,
    impoconsumoRatePercent,
    setImpoconsumoRatePercent,
    durationInput,
    setDurationInput,
    setDuration,
    durationAdjustmentMessage,
    setDurationAdjustmentMessage,
    week,
    setWeek,
    currentDayIndex,
    setCurrentDayIndex,
    existingImages,
    newImages,
    handleAddImages,
    handleRemoveExistingImage,
    handleRemoveNewImage,
    formErrors,
    setFormErrors,
    imageError,
    editingItem,
    saleConcept,
    setSaleConcept,
  } = props;

  const { taxSettingsEnabled } = useTaxSettings();

  const totalImages = existingImages.length + newImages.length;
  const [badgeIndex, setBadgeIndex] = useState<0 | 1>(0);

  const currentBadgeColor = badgeIndex === 0 ? props.badgeColor1 : props.badgeColor2;
  const setCurrentBadgeColor = badgeIndex === 0 ? props.setBadgeColor1 : props.setBadgeColor2;
  const currentBadgeText = badgeIndex === 0 ? props.badgeText1 : props.badgeText2;
  const setCurrentBadgeText = badgeIndex === 0 ? props.setBadgeText1 : props.setBadgeText2;
  const currentPlaceholder = badgeIndex === 0 ? "Ej: POP" : "Ej: Nuevo";

  const activeDay = week[currentDayIndex];
  let hasOverlapError = false;
  if (activeDay && activeDay.ranges.length === 2) {
    const t1s = activeDay.ranges[0].start.split(":");
    const t1e = activeDay.ranges[0].end.split(":");
    const t2s = activeDay.ranges[1].start.split(":");
    const t2e = activeDay.ranges[1].end.split(":");
    
    const m1s = parseInt(t1s[0], 10) * 60 + parseInt(t1s[1] || "0", 10);
    const m1e = parseInt(t1e[0], 10) * 60 + parseInt(t1e[1] || "0", 10);
    const m2s = parseInt(t2s[0], 10) * 60 + parseInt(t2s[1] || "0", 10);
    const m2e = parseInt(t2e[0], 10) * 60 + parseInt(t2e[1] || "0", 10);

    if (m1s <= m2s) {
      if (m1e >= m2s) hasOverlapError = true;
    } else {
      if (m2e >= m1s) hasOverlapError = true;
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER DEL MODAL */}
      <div className="flex flex-col gap-0.5 mb-2 px-1">
        <h2 className="font-medium text-slate-900 text-lg">
          {editingItem
            ? (type === "PRODUCT" ? "Editar Producto" : "Editar Servicio")
            : (type === "PRODUCT" ? "Nuevo Producto" : "Nuevo Servicio")}
        </h2>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
          CATÁLOGO DE MI NEGOCIO
        </span>
      </div>

      {/* TOGGLE PRODUCTO / SERVICIO */}
      {!editingItem && (
        <div className="flex bg-neutral-100 rounded-full p-1">
          <button
            onClick={() => {
              setType("PRODUCT");
              setFormErrors((p) => ({ ...p, schedule: undefined }));
            }}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "PRODUCT" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            Producto
          </button>
          <button
            onClick={() => {
              setType("SERVICE");
              setInventoryMode("NONE");
              setFormErrors((p) => ({ ...p, schedule: undefined }));
            }}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "SERVICE" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            Servicio
          </button>
        </div>
      )}

      {/* FOTOS */}
      <div className="space-y-3">
        <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Fotos</label>
        <div className="flex flex-wrap gap-3">
          <label className={`w-20 h-20 border-2 border-dashed rounded-2xl flex items-center justify-center cursor-pointer text-xl transition ${totalImages >= MAX_ITEM_IMAGES ? "border-neutral-200 text-neutral-200 cursor-not-allowed" : "border-[#0B3F64] text-[#0B3F64] bg-[#0B3F64]/5 hover:bg-[#0B3F64]/10"}`}>
            +
            <input type="file" accept="image/*" multiple className="hidden" disabled={totalImages >= MAX_ITEM_IMAGES} onChange={(e) => { handleAddImages(e.target.files); e.target.value = ""; }} />
          </label>
          {existingImages.map((img) => (
            <div key={img.id} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-neutral-100 shadow-sm">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button onClick={() => handleRemoveExistingImage(img.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"><X size={12} /></button>
            </div>
          ))}
          {newImages.map((img) => (
            <div key={img.id} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-neutral-100 shadow-sm">
              <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
              <button onClick={() => handleRemoveNewImage(img.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"><X size={12} /></button>
            </div>
          ))}
        </div>
        {imageError && (
          <p className="text-xs font-medium text-rose-600 mt-2 transition-all">
            {imageError}
          </p>
        )}
      </div>

      {/* NOMBRE */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Nombre</label>
        <input
          placeholder={type === "PRODUCT" ? "Ej: Hamburguesa Simple" : "Ej: Corte de Cabello"}
          value={name}
          onChange={(e) => { setName(e.target.value); setFormErrors(p => ({ ...p, name: undefined })); }}
          className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${formErrors.name ? "border-red-300 bg-red-50" : "border-neutral-100 bg-white shadow-sm focus:border-[#0B3F64]"}`}
        />
        {formErrors.name && <p className="text-[10px] font-medium text-red-500 uppercase">{formErrors.name}</p>}
      </div>

      {/* PRECIO + DURACION */}
      <div className={`grid gap-4 ${type === "SERVICE" ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Precio</label>
          <div className={`flex items-center rounded-2xl border px-4 h-[48px] shadow-sm transition ${formErrors.price ? "border-red-300 bg-red-50" : "border-neutral-100 bg-white"}`}>
            <span className="text-neutral-400 text-sm mr-2">$</span>
            <input
              type="text" inputMode="decimal" placeholder="0,00" value={priceDisplay}
              onChange={(e) => {
                const f = formatPriceInput(e.target.value);
                setPriceDisplay(f); setPrice(parsePriceInput(f)); setFormErrors(p => ({ ...p, price: undefined }));
              }}
              className="flex-1 bg-transparent outline-none text-sm font-semibold"
            />
          </div>
          {formErrors.price && <p className="text-[10px] font-medium text-red-500 uppercase">{formErrors.price}</p>}
        </div>

        {type === "SERVICE" && (
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Duración</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal" value={durationInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                  const parts = v.split(".");
                  const cleanValue = parts[0] + (parts.length > 1 ? "." + parts.slice(1).join("") : "");
                  setDurationInput(cleanValue);
                  setDurationAdjustmentMessage(null);
                  setFormErrors(p => ({ ...p, duration: undefined }));
                }}
                onBlur={() => {
                  const n = parseFloat(durationInput);
                  if (!durationInput || isNaN(n)) {
                    setDuration(60);
                    setDurationInput("1");
                    setDurationAdjustmentMessage(null);
                  } else {
                    let rounded = Math.round(n);
                    if (rounded <= 0) rounded = 1;

                    if (n !== rounded) {
                      setDurationAdjustmentMessage(`La duración se ha ajustado a ${rounded} hora(s)`);
                    } else {
                      setDurationAdjustmentMessage(null);
                    }
                    setDuration(rounded * 60);
                    setDurationInput(String(rounded));
                  }
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm outline-none transition ${formErrors.duration ? "border-red-300 bg-red-50" : "border-neutral-100 bg-white focus:border-[#0B3F64]"
                  }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px] font-medium uppercase">horas</span>
            </div>
            {durationAdjustmentMessage && (
              <p className="text-[11px] font-medium text-amber-600 mt-1">
                {durationAdjustmentMessage}
              </p>
            )}
            {formErrors.duration && (
              <p className="text-[10px] font-medium text-red-500 uppercase mt-1">
                {formErrors.duration}
              </p>
            )}
          </div>
        )}
      </div>

      {taxSettingsEnabled && (
        <section className="space-y-4 rounded-2xl border border-neutral-100 bg-neutral-50/70 p-4">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Configuración fiscal
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              El IVA y retenciones se calculan automáticamente según el RUT del negocio y el concepto seleccionado.
            </p>
          </div>

          <div className="space-y-3 border-t border-neutral-200/70 pt-4">
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
                Concepto fiscal
              </label>
              <select
                value={saleConcept}
                onChange={(e) => setSaleConcept(e.target.value as any)}
                className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#0B3F64] transition text-slate-700 font-medium"
              >
                <option value="GOODS">Bienes / Productos</option>
                <option value="SERVICES">Servicios Generales</option>
                <option value="HONORARIOS">Honorarios</option>
                <option value="ARRENDAMIENTOS">Arrendamientos</option>
                <option value="FOOD_BEVERAGES">Consumo (Comidas/Bebidas)</option>
                <option value="OTHER">Otros Conceptos</option>
              </select>
            </div>

            {type === "PRODUCT" && (
              <>
                <label className="flex cursor-pointer items-center justify-between gap-4 pt-2">
                  <span>
                    <span className="block text-sm font-semibold text-neutral-800">
                      Aplica impoconsumo
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      Actívalo para productos sujetos al impuesto al consumo.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={appliesImpoconsumo}
                    onChange={(event) => {
                      setAppliesImpoconsumo(event.target.checked);
                      if (!event.target.checked) {
                        setImpoconsumoRatePercent("");
                        setFormErrors((current) => ({
                          ...current,
                          impoconsumoRate: undefined,
                        }));
                      }
                    }}
                    className="h-5 w-5 rounded border-neutral-300 text-[#0B3F64] focus:ring-[#0B3F64]"
                  />
                </label>

                {appliesImpoconsumo && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
                      Tarifa impoconsumo
                    </label>
                    <div
                      className={`flex h-12 items-center rounded-2xl border bg-white px-4 shadow-sm ${
                        formErrors.impoconsumoRate ? "border-red-300" : "border-neutral-100"
                      }`}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        value={impoconsumoRatePercent}
                        onChange={(event) => {
                          const value = event.target.value
                            .replace(/[^0-9.,]/g, "")
                            .replace(",", ".");
                          setImpoconsumoRatePercent(value);
                          setFormErrors((current) => ({
                            ...current,
                            impoconsumoRate: undefined,
                          }));
                        }}
                        placeholder="Ej: 8"
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                      <span className="text-sm text-neutral-400">%</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-neutral-500">
                      Déjala vacía para usar la tarifa global. El porcentaje se envía como decimal al guardar.
                    </p>
                    {formErrors.impoconsumoRate && (
                      <p className="text-[10px] font-medium uppercase text-red-500">
                        {formErrors.impoconsumoRate}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* INVENTARIO (PRODUCT ONLY) */}
      {type === "PRODUCT" && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
            Inventario
          </label>

          <div className="flex bg-neutral-100 rounded-xl p-1 w-full gap-1 border border-neutral-200/50">
            <button
              type="button"
              onClick={() => {
                setInventoryMode("NONE");
                setFormErrors((p) => ({ ...p, inventory: undefined }));
              }}
              className={`flex-1 py-2.5 text-center text-xs font-semibold rounded-lg transition active:scale-95 duration-150 ${
                inventoryMode === "NONE"
                  ? "bg-[#0B3F64] text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              No controla
            </button>
            <button
              type="button"
              onClick={() => {
                setInventoryMode("SIMPLE");
                setFormErrors((p) => ({ ...p, inventory: undefined }));
              }}
              className={`flex-1 py-2.5 text-center text-xs font-semibold rounded-lg transition active:scale-95 duration-150 ${
                inventoryMode === "SIMPLE"
                  ? "bg-[#0B3F64] text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => {
                setInventoryMode("RECIPE_BASED");
                setFormErrors((p) => ({ ...p, inventory: undefined }));
              }}
              className={`flex-1 py-2.5 text-center text-xs font-semibold rounded-lg transition active:scale-95 duration-150 ${
                inventoryMode === "RECIPE_BASED"
                  ? "bg-[#0B3F64] text-white shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Receta
            </button>
          </div>

          {formErrors.inventory && (
            <p className="text-[10px] font-medium text-red-500 uppercase mt-1">
              {formErrors.inventory}
            </p>
          )}
        </div>
      )}

      {/* HORARIOS (SERVICE ONLY) */}
      {type === "SERVICE" && (
        <div className="space-y-4">
          <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Disponibilidad semanal</label>
          <div className="flex justify-between gap-1">
            {week.map((day, i) => (
              <button
                key={day.day}
                onClick={() => {
                  const c = week.map(d => ({ ...d, ranges: [...d.ranges] }));
                  c[i].active = !c[i].active;
                  if (c[i].active && c[i].ranges.length === 0) c[i].ranges = [{ start: "08:00", end: "12:00" }];
                  if (!c[i].active) c[i].ranges = [];
                  setWeek(c);
                  if (!c[i].active && i === currentDayIndex) {
                    const first = c.findIndex(d => d.active);
                    if (first !== -1) setCurrentDayIndex(first);
                  } else if (c[i].active && c.filter(d => d.active).length === 1) {
                    setCurrentDayIndex(i);
                  }
                  setFormErrors(p => ({ ...p, schedule: undefined }));
                }}
                className={`flex-1 h-9 rounded-xl text-[10px] font-medium transition ${day.active ? "bg-[#0B3F64] text-white shadow-md shadow-[#0B3F64]/20" : "bg-neutral-100 text-neutral-500"}`}
              >
                {day.day.slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>

          {!week.some(d => d.active) ? (
            <div className="flex flex-col items-center justify-center py-8 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
              <Clock size={20} className="text-neutral-300 mb-2" />
              <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">Selecciona un día</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 1. Bloque de Navegación de Días */}
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-2 font-semibold text-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    const activeIndices = week.map((d, i) => d.active ? i : -1).filter(i => i !== -1);
                    if (activeIndices.length <= 1) return;
                    const pos = activeIndices.indexOf(currentDayIndex);
                    setCurrentDayIndex(activeIndices[(pos - 1 + activeIndices.length) % activeIndices.length]);
                  }} 
                  disabled={week.filter(d => d.active).length <= 1} 
                  className="p-2 hover:bg-gray-100 rounded-full text-2xl font-bold text-gray-800 transition-colors flex items-center justify-center w-9 h-9 active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed select-none"
                  aria-label="Día anterior"
                >
                  &#8249;
                </button>
                
                <span className="w-full text-center tracking-wide uppercase text-sm select-none">
                  {week[currentDayIndex].day}
                </span>

                <button 
                  type="button"
                  onClick={() => {
                    const activeIndices = week.map((d, i) => d.active ? i : -1).filter(i => i !== -1);
                    if (activeIndices.length <= 1) return;
                    const pos = activeIndices.indexOf(currentDayIndex);
                    setCurrentDayIndex(activeIndices[(pos + 1) % activeIndices.length]);
                  }} 
                  disabled={week.filter(d => d.active).length <= 1} 
                  className="p-2 hover:bg-gray-100 rounded-full text-2xl font-bold text-gray-800 transition-colors flex items-center justify-center w-9 h-9 active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed select-none"
                  aria-label="Día siguiente"
                >
                  &#8250;
                </button>
              </div>

              {/* 2. Fila de Horarios Completa (Estructura Indestructible con micro-gaps) */}
              <div className={`rounded-3xl border p-4 space-y-3 transition ${formErrors.schedule || hasOverlapError ? "border-red-200 bg-red-50/30" : "border-neutral-100 bg-white shadow-sm"}`}>
                {week[currentDayIndex].ranges.map((range, ri) => (
                  <div key={ri} className="flex items-center justify-between gap-1.5 py-2">
                    <div className="flex items-center">
                      {/* Inicio de franja — selector AM/PM */}
                      <TimeSelectAMPM
                        value={range.start}
                        onChange={(newStart) => {
                          const copy = week.map((d, idx) => {
                            if (idx !== currentDayIndex) return d;
                            return {
                              ...d,
                              ranges: d.ranges.map((r, rIdx) => 
                                rIdx === ri ? { ...r, start: newStart } : r
                              )
                            };
                          });
                          setWeek(copy);
                        }}
                      />

                      {/* Separador Central (—) */}
                      <span className="text-gray-400 px-0.5 select-none font-semibold">—</span>

                      {/* Fin de franja — selector AM/PM */}
                      <TimeSelectAMPM
                        value={range.end}
                        onChange={(newEnd) => {
                          const copy = week.map((d, idx) => {
                            if (idx !== currentDayIndex) return d;
                            return {
                              ...d,
                              ranges: d.ranges.map((r, rIdx) => 
                                rIdx === ri ? { ...r, end: newEnd } : r
                              )
                            };
                          });
                          setWeek(copy);
                        }}
                      />
                    </div>

                    {/* Botón Eliminar (X) */}
                    <button 
                      type="button"
                      onClick={() => {
                        const copy = week.map((d, idx) => {
                          if (idx !== currentDayIndex) return d;
                          return {
                            ...d,
                            ranges: d.ranges.filter((_, rIdx) => rIdx !== ri)
                          };
                        });
                        setWeek(copy);
                      }} 
                      className="text-gray-400 hover:text-red-500 p-2 text-sm transition-colors active:scale-90"
                      aria-label="Eliminar franja"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {week[currentDayIndex].ranges.length < 2 && (
                  <button 
                    type="button"
                    onClick={() => {
                      const copy = week.map((d, idx) => {
                        if (idx !== currentDayIndex) return d;
                        const r = [...d.ranges];
                        if (r.length === 0) r.push({ start: "08:00", end: "12:00" });
                        else if (r.length === 1) r.push({ start: "14:00", end: "18:00" });
                        return { ...d, ranges: r };
                      });
                      setWeek(copy);
                    }} 
                    className="w-full py-2 text-[10px] font-medium text-[#0B3F64] uppercase tracking-widest hover:bg-[#0B3F64]/5 rounded-xl transition"
                  >
                    + Agregar horario
                  </button>
                )}
              </div>

              {hasOverlapError && (
                <p className="text-[11px] font-bold text-red-500 mt-2 bg-red-50 border border-red-200/50 rounded-xl p-2.5 text-center">
                  El segundo turno no puede comenzar antes de que termine el primer turno
                </p>
              )}
            </div>
          )}
          {formErrors.schedule && <p className="text-[10px] font-medium text-red-500 uppercase">{formErrors.schedule}</p>}
        </div>
      )}

      {/* BADGES (Badge 1 / Badge 2) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setBadgeIndex((prev) => (prev === 0 ? 1 : 0))}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 transition"
            aria-label="Badge anterior"
          >
            ‹
          </button>
          <p className="text-xs font-medium text-neutral-700 uppercase tracking-widest">
            {badgeIndex === 0 ? "Badge 1" : "Badge 2"}
          </p>
          <button
            type="button"
            onClick={() => setBadgeIndex((prev) => (prev === 0 ? 1 : 0))}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 transition"
            aria-label="Siguiente badge"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-7 space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Texto</label>
            <input
              placeholder={currentPlaceholder}
              value={currentBadgeText}
              onChange={(e) => setCurrentBadgeText(e.target.value)}
              className="h-11 w-full rounded-2xl border border-neutral-100 bg-white px-4 text-sm outline-none shadow-sm transition focus:border-[#0B3F64]"
            />
          </div>

          <div className="col-span-5 space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">Color</label>
            <BadgeColorSelect
              value={currentBadgeColor}
              onChange={setCurrentBadgeColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
