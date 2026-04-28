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
import { ItemFormContent } from "./ItemFormContent";

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
      <ItemFormContent 
        type={type}
        setType={setType}
        name={name}
        setName={setName}
        priceDisplay={priceDisplay}
        setPriceDisplay={setPriceDisplay}
        setPrice={setPrice}
        durationInput={durationInput}
        setDurationInput={setDurationInput}
        setDuration={setDuration}
        week={week}
        setWeek={setWeek}
        currentDayIndex={currentDayIndex}
        setCurrentDayIndex={setCurrentDayIndex}
        existingImages={existingImages}
        newImages={newImages}
        handleAddImages={handleAddImages}
        handleRemoveExistingImage={handleRemoveExistingImage}
        handleRemoveNewImage={handleRemoveNewImage}
        formErrors={formErrors}
        setFormErrors={setFormErrors}
        imageError={imageError}
        editingItem={!!editingItem}
      />

      {/* DESCRIPCION (Sólo visible en el Modal por ahora, se moverá al ChatComposer) */}
      <div className="space-y-2 pb-4">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Descripción</label>
          <span className={`text-[9px] font-bold ${description.length >= 300 ? 'text-red-500' : 'text-neutral-400'}`}>{description.length}/300</span>
        </div>
        <textarea
          placeholder="Descripción (opcional)" rows={4} maxLength={300} value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-2xl border border-neutral-100 bg-white p-4 text-sm shadow-sm outline-none resize-none focus:border-green-500 transition"
        />
      </div>
    </ItemPanelLayout>
  );
}
