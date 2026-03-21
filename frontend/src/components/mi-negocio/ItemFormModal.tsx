"use client";

import { useState, useEffect } from "react";
import { X, Clock } from "lucide-react";
import { api } from "@/src/lib/api";
import { invalidateCache } from "@/src/lib/cache";
import {
  formatBytesToMb,
  MAX_ITEM_IMAGES,
  MAX_ITEM_IMAGE_SIZE_BYTES,
} from "@/src/lib/itemImages";
import { 
  Item, 
  ItemType, 
  ItemImage, 
  PendingImage, 
  WeeklySchedule, 
  FormErrors 
} from "@/src/types/item";
import { 
  generateCreationId, 
  formatPriceInput, 
  parsePriceInput, 
  rangesOverlap,
  minutesToTime,
  timeToMinutes,
  createInitialWeek,
  WEEKDAY_ENUM
} from "@/src/lib/itemHelpers";
import { ItemPanelLayout } from "./ItemPanelLayout";

interface ItemFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (item: Item) => void;
  editingItem: Item | null;
  setToast: (toast: { message: string; type: "success" | "error" } | null) => void;
}

function revokePendingImages(images: PendingImage[]) {
  images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("No se pudo leer la imagen."));
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export default function ItemFormModal({ open, onClose, onSaved, editingItem, setToast }: ItemFormModalProps) {
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("");
  const [description, setDescription] = useState("");
  const [existingImages, setExistingImages] = useState<ItemImage[]>([]);
  const [newImages, setNewImages] = useState<PendingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");
  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const totalImages = existingImages.length + newImages.length;

  // Sync with editingItem
  useEffect(() => {
    if (editingItem) {
      setType(editingItem.type);
      setName(editingItem.name);
      setPrice(String(editingItem.price));
      setPriceDisplay(formatPriceInput(String(editingItem.price).replace(".", ",")));
      setDescription(editingItem.description ?? "");
      setExistingImages(editingItem.images ?? []);
      setNewImages([]);
      setRemovedImageIds([]);
      setImageError(null);
      setDuration(editingItem.durationMinutes ?? 30);
      setDurationInput(String(editingItem.durationMinutes ?? 30));
      
      const nextWeek = createInitialWeek();
      if (editingItem.type === "SERVICE" && editingItem.schedule?.length) {
        nextWeek.forEach(d => { d.active = false; d.ranges = []; });
        editingItem.schedule.forEach(slot => {
          const dayIdx = WEEKDAY_ENUM.indexOf(slot.weekday);
          if (dayIdx !== -1) {
            nextWeek[dayIdx].active = true;
            nextWeek[dayIdx].ranges.push({
              start: minutesToTime(slot.startMinute),
              end: minutesToTime(slot.endMinute)
            });
          }
        });
      }
      setWeek(nextWeek);
      const firstActive = nextWeek.findIndex(d => d.active);
      setCurrentDayIndex(firstActive !== -1 ? firstActive : 0);
    } else {
      resetForm();
    }
  }, [editingItem, open]);

  const resetForm = () => {
    setName("");
    setPrice("");
    setPriceDisplay("");
    setDescription("");
    revokePendingImages(newImages);
    setNewImages([]);
    setExistingImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setDuration(30);
    setDurationInput("30");
    setWeek(createInitialWeek());
    setCurrentDayIndex(0);
    setFormErrors({});
    setType("PRODUCT");
  };

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    const availableSlots = MAX_ITEM_IMAGES - totalImages;

    if (availableSlots <= 0) {
      setImageError(`Puedes subir hasta ${MAX_ITEM_IMAGES} imágenes.`);
      return;
    }

    const nextPendingImages: PendingImage[] = [];
    const rejectedBySize: string[] = [];

    selectedFiles.slice(0, availableSlots).forEach((file) => {
      if (file.size > MAX_ITEM_IMAGE_SIZE_BYTES) {
        rejectedBySize.push(file.name);
        return;
      }
      nextPendingImages.push({
        id: generateCreationId(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });

    setNewImages((prev) => [...prev, ...nextPendingImages]);

    const errors: string[] = [];
    if (selectedFiles.length > availableSlots) errors.push(`Puedes subir hasta ${MAX_ITEM_IMAGES} imágenes.`);
    if (rejectedBySize.length > 0) errors.push(`Máximo ${formatBytesToMb(MAX_ITEM_IMAGE_SIZE_BYTES)} por imagen.`);
    setImageError(errors.length > 0 ? errors.join(" ") : null);
  };

  const handleRemoveExistingImage = (id: string) => {
    setExistingImages(prev => prev.filter(img => img.id !== id));
    setRemovedImageIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleRemoveNewImage = (id: string) => {
    setNewImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleSend = async () => {
    const errors: FormErrors = {};
    if (!name.trim()) errors.name = "El nombre es obligatorio";
    if (!price || parseFloat(price) <= 0) errors.price = "El precio debe ser mayor a 0";
    
    if (type === "SERVICE") {
      if (duration < 5) errors.duration = "Mínimo 5 min";
      if (!week.some((d) => d.active && d.ranges.length > 0)) {
        errors.schedule = "Selecciona al menos un día con horario";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const schedule = type === "SERVICE" ? week.flatMap((day, dayIndex) => 
        day.active ? day.ranges.map(r => ({
          weekday: WEEKDAY_ENUM[dayIndex],
          startMinute: timeToMinutes(r.start),
          endMinute: timeToMinutes(r.end)
        })) : []
      ) : [];

      const body = {
        type,
        name,
        price: parseFloat(price),
        description: description.trim() || null,
        durationMinutes: type === "SERVICE" ? duration : null,
        schedule,
      };

      let savedItem: Item;
      if (editingItem) {
        savedItem = await api<Item>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        for (const id of removedImageIds) {
          await api(`/items/${editingItem.id}/images/${id}`, { method: "DELETE" });
        }
        for (const img of newImages) {
          const dataUrl = await fileToDataUrl(img.file);
          await api(`/items/${editingItem.id}/images`, {
            method: "POST",
            body: JSON.stringify({ url: dataUrl }),
          });
        }
        savedItem = await api<Item>(`/items/${editingItem.id}`);
      } else {
        const created = await api<Item>(`/items`, {
          method: "POST",
          body: JSON.stringify({ ...body, id: generateCreationId() }),
        });

        for (const img of newImages) {
          const dataUrl = await fileToDataUrl(img.file);
          await api(`/items/${created.id}/images`, {
            method: "POST",
            body: JSON.stringify({ url: dataUrl }),
          });
        }
        savedItem = await api<Item>(`/items/${created.id}`);
      }

      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      onSaved(savedItem);
      onClose();
      resetForm();
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al guardar item", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ItemPanelLayout
      open={open}
      onClose={onClose}
      title={editingItem ? (type === "PRODUCT" ? "Editar producto" : "Editar servicio") : (type === "PRODUCT" ? "Nuevo producto" : "Nuevo servicio")}
      footer={
        <div className="flex justify-end">
          <button
            onClick={handleSend}
            disabled={isSubmitting}
            className={`w-full py-4 rounded-xl bg-green-600 text-white font-bold shadow-lg flex items-center justify-center active:scale-95 transition ${
              isSubmitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Guardando..." : (editingItem ? "Guardar cambios" : "Crear ítem")}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* TOGGLE PRODUCTO / SERVICIO */}
        {!editingItem && (
          <div className="flex bg-neutral-100 rounded-full p-1">
            <button
              onClick={() => { setType("PRODUCT"); setFormErrors({}); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "PRODUCT" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              Producto
            </button>
            <button
              onClick={() => { setType("SERVICE"); setFormErrors({}); }}
              className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "SERVICE" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              Servicio
            </button>
          </div>
        )}

        {/* FOTOS */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fotos</label>
          <div className="flex flex-wrap gap-3">
            <label className={`w-20 h-20 border-2 border-dashed rounded-2xl flex items-center justify-center cursor-pointer text-xl ${totalImages >= MAX_ITEM_IMAGES ? "border-neutral-200 text-neutral-200 cursor-not-allowed" : "border-green-500 text-green-600 bg-green-50/50"}`}>
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
          {imageError && <p className="text-[10px] font-bold text-red-500 uppercase">{imageError}</p>}
        </div>

        {/* NOMBRE */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{type === "PRODUCT" ? "Nombre del producto" : "Nombre del servicio"}</label>
          <input
            placeholder={type === "PRODUCT" ? "Ej: Hamburguesa Simple" : "Ej: Corte de Cabello"}
            value={name}
            onChange={(e) => { setName(e.target.value); setFormErrors(p => ({ ...p, name: undefined })); }}
            className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${formErrors.name ? "border-red-300 bg-red-50" : "border-neutral-100 bg-white shadow-sm focus:border-green-500"}`}
          />
          {formErrors.name && <p className="text-[10px] font-bold text-red-500 uppercase">{formErrors.name}</p>}
        </div>

        {/* PRECIO + DURACION */}
        <div className={`grid gap-4 ${type === "SERVICE" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Precio</label>
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
            {formErrors.price && <p className="text-[10px] font-bold text-red-500 uppercase">{formErrors.price}</p>}
          </div>

          {type === "SERVICE" && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Duración</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric" value={durationInput}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    setDurationInput(v); if (v && !isNaN(Number(v))) setDuration(Number(v));
                  }}
                  onBlur={() => {
                    const n = Number(durationInput);
                    if (!durationInput || isNaN(n) || n < 5) { setDuration(5); setDurationInput("5"); }
                    else { setDuration(n); setDurationInput(String(n)); }
                  }}
                  className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold shadow-sm outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px] font-bold uppercase">min</span>
              </div>
            </div>
          )}
        </div>

        {/* HORARIOS (SERVICE ONLY) */}
        {type === "SERVICE" && (
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Disponibilidad semanal</label>
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
                  className={`flex-1 h-9 rounded-xl text-[10px] font-bold transition ${day.active ? "bg-green-600 text-white shadow-md shadow-green-100" : "bg-neutral-100 text-neutral-500"}`}
                >
                  {day.day.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>

            {!week.some(d => d.active) ? (
              <div className="flex flex-col items-center justify-center py-8 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                <Clock size={20} className="text-neutral-300 mb-2" />
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Selecciona un día</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <button onClick={() => {
                    const activeIndices = week.map((d, i) => d.active ? i : -1).filter(i => i !== -1);
                    if (activeIndices.length <= 1) return;
                    const pos = activeIndices.indexOf(currentDayIndex);
                    setCurrentDayIndex(activeIndices[(pos - 1 + activeIndices.length) % activeIndices.length]);
                  }} disabled={week.filter(d => d.active).length <= 1} className="w-8 h-8 flex items-center justify-center text-neutral-400 disabled:opacity-20 transition">‹</button>
                  <p className="text-xs font-bold text-neutral-700 uppercase tracking-widest">{week[currentDayIndex].day}</p>
                  <button onClick={() => {
                    const activeIndices = week.map((d, i) => d.active ? i : -1).filter(i => i !== -1);
                    if (activeIndices.length <= 1) return;
                    const pos = activeIndices.indexOf(currentDayIndex);
                    setCurrentDayIndex(activeIndices[(pos + 1) % activeIndices.length]);
                  }} disabled={week.filter(d => d.active).length <= 1} className="w-8 h-8 flex items-center justify-center text-neutral-400 disabled:opacity-20 transition">›</button>
                </div>

                <div className={`rounded-3xl border p-4 space-y-3 transition ${formErrors.schedule ? "border-red-200 bg-red-50/30" : "border-neutral-100 bg-white shadow-sm"}`}>
                  {week[currentDayIndex].ranges.map((range, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <input type="time" value={range.start} onChange={(e) => {
                        const copy = [...week]; const newStart = e.target.value;
                        if (!copy[currentDayIndex].ranges.some((r, i) => i !== ri && rangesOverlap(newStart, range.end, r.start, r.end))) {
                          copy[currentDayIndex].ranges[ri].start = newStart; setWeek(copy);
                        }
                      }} className="bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2 text-xs font-semibold h-10 flex-1 outline-none focus:border-green-500" />
                      <span className="text-neutral-300">—</span>
                      <input type="time" value={range.end} onChange={(e) => {
                        const copy = [...week]; const newEnd = e.target.value;
                        if (!copy[currentDayIndex].ranges.some((r, i) => i !== ri && rangesOverlap(range.start, newEnd, r.start, r.end))) {
                          copy[currentDayIndex].ranges[ri].end = newEnd; setWeek(copy);
                        }
                      }} className="bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2 text-xs font-semibold h-10 flex-1 outline-none focus:border-green-500" />
                      <button onClick={() => {
                        const copy = [...week]; copy[currentDayIndex].ranges.splice(ri, 1); setWeek(copy);
                      }} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-500 transition">✕</button>
                    </div>
                  ))}
                  {week[currentDayIndex].ranges.length < 2 && (
                    <button onClick={() => {
                      const c = [...week]; const r = c[currentDayIndex].ranges;
                      if (r.length === 0) r.push({ start: "08:00", end: "12:00" });
                      else if (r.length === 1) r.push({ start: "14:00", end: "18:00" });
                      setWeek(c);
                    }} className="w-full py-2 text-[10px] font-bold text-green-600 uppercase tracking-widest hover:bg-green-50 rounded-xl transition">+ Agregar horario</button>
                  )}
                </div>
              </div>
            )}
            {formErrors.schedule && <p className="text-[10px] font-bold text-red-500 uppercase">{formErrors.schedule}</p>}
          </div>
        )}

        {/* DESCRIPCION */}
        <div className="space-y-2 pb-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Descripción</label>
            <span className={`text-[9px] font-bold ${description.length >= 300 ? 'text-red-500' : 'text-neutral-400'}`}>{description.length}/300</span>
          </div>
          <textarea
            placeholder="Describe tu producto o servicio..." rows={4} maxLength={300} value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-2xl border border-neutral-100 bg-white p-4 text-sm shadow-sm outline-none resize-none focus:border-green-500 transition"
          />
        </div>
      </div>
    </ItemPanelLayout>
  );
}
