"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, X, Clock } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { getCached, getInstantCache, invalidateCache } from "@/src/lib/cache";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";
import ItemDetailModal from "@/src/components/mi-negocio/ItemDetailModal";
import { MiNegocioChatComposer } from "@/src/components/mi-negocio/MiNegocioChatComposer";
import { ItemFormContent } from "@/src/components/mi-negocio/ItemFormContent";
import { Item, ItemType, ItemImage, PendingImage, WeeklySchedule, FormErrors } from "@/src/types/item";
import { 
  generateCreationId, 
  createInitialWeek, 
  WEEKDAY_ENUM,
  formatPriceInput,
  parsePriceInput,
  timeToMinutes,
  minutesToTime
} from "@/src/lib/itemHelpers";
import { 
  MAX_ITEM_IMAGES, 
  MAX_ITEM_IMAGE_SIZE_BYTES 
} from "@/src/lib/itemImages";


export default function MiNegocioPage() {

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemForDetail, setItemForDetail] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  // Composer / Form states
  const [composerMode, setComposerMode] = useState<"closed" | "create" | "edit">("closed");
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
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      const dbStatus = 'ACTIVE';
      const key = `mi-negocio:items:${dbStatus}`;
      const hasInstant = !!getInstantCache<Item[]>(key, 60_000);
      
      if (!hasInstant && isInitial) {
        setLoading(true);
      }

      const data = await getCached(key, 60_000, () => 
        api<Item[]>(`/items?status=ACTIVE&lightweight=true`)
      );
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleCount(12); // Reset count on filter change
    fetchItems(true);
  }, [fetchItems]);

  const resetForm = useCallback(() => {
    setName("");
    setPrice("");
    setPriceDisplay("");
    setDescription("");
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
    setEditingItem(null);
  }, []);

  const handleToggleComposer = () => {
    if (composerMode !== "closed") {
      setComposerMode("closed");
      resetForm();
    } else {
      setComposerMode("create");
    }
  };

  const handleStartEdit = (item: Item | null) => {
    if (!item) {
      setComposerMode("create");
      resetForm();
      return;
    }
    
    setEditingItem(item);
    setComposerMode("edit");
    setSelectedItem(null);
    
    // Fill form
    setType(item.type);
    setName(item.name);
    setPrice(String(item.price));
    setPriceDisplay(formatPriceInput(String(item.price).replace(".", ",")));
    setDescription(item.description ?? "");
    setExistingImages(item.images ?? []);
    setNewImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setDuration(item.durationMinutes ?? 30);
    setDurationInput(String(item.durationMinutes ?? 30));
    
    const nextWeek = createInitialWeek();
    if (item.type === "SERVICE" && item.schedule?.length) {
      nextWeek.forEach(d => { d.active = false; d.ranges = []; });
      item.schedule.forEach(slot => {
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
  };

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    const totalImages = existingImages.length + newImages.length;
    const availableSlots = MAX_ITEM_IMAGES - totalImages;

    if (availableSlots <= 0) {
      setImageError(`Puedes subir hasta ${MAX_ITEM_IMAGES} imágenes.`);
      return;
    }

    const nextPendingImages: PendingImage[] = [];
    selectedFiles.slice(0, availableSlots).forEach((file) => {
      if (file.size > MAX_ITEM_IMAGE_SIZE_BYTES) return;
      nextPendingImages.push({
        id: generateCreationId(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });
    setNewImages((prev) => [...prev, ...nextPendingImages]);
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
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(img.file);
          });
          const dataUrl = await base64Promise;
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
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(img.file);
          });
          const dataUrl = await base64Promise;
          await api(`/items/${created.id}/images`, {
            method: "POST",
            body: JSON.stringify({ url: dataUrl }),
          });
        }
        savedItem = await api<Item>(`/items/${created.id}`);
      }

      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      
      setItems(prev => {
        const exists = prev.find(i => i.id === savedItem.id);
        if (exists) return prev.map(i => i.id === savedItem.id ? savedItem : i);
        return [savedItem, ...prev];
      });
      if (selectedItem?.id === savedItem.id) setSelectedItem(savedItem);

      setToast({ message: editingItem ? "Item actualizado" : "Item creado", type: "success" });
      setComposerMode("closed");
      resetForm();
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al guardar", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Item) => {
    try {
      await api(`/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "INACTIVE" }),
      });
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItem(null);
      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      setToast({ message: "Item eliminado", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al eliminar", type: "error" });
    }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100">
      {selectedItem ? (
        <SelectionActionBar
          visible
          title="Item seleccionado"
          onClose={() => setSelectedItem(null)}
          onView={() => setItemForDetail(selectedItem)}
          onEdit={() => handleStartEdit(selectedItem)}
          editLabel="Editar"
          onDelete={() => setDeleteId(selectedItem.id)}
          deleteLabel="Eliminar"
          deleteIcon={Trash2}
        />
      ) : (
        <AppHeader title="Mi negocio" showBack={true} hrefBack="/home" />
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {loading && <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">Cargando...</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest">No hay items creados</div>
        )}
        
        <div className="grid grid-cols-1 gap-4">
          {items.slice(0, visibleCount).map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedItem?.id === item.id}
              onSelect={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
            />
          ))}
        </div>

        {items.length > visibleCount && (
          <div className="flex justify-center pb-8 pt-2">
            <button
              onClick={() => setVisibleCount((prev) => prev + 12)}
              className="px-6 py-2.5 bg-white border border-neutral-100 text-neutral-500 font-bold rounded-full shadow-sm active:scale-95 transition text-[10px] uppercase tracking-widest"
            >
              Cargar más
            </button>
          </div>
        )}
      </main>

      {/* COMPONENTES DE CHAT COMPOSER */}
      <MiNegocioChatComposer
        mode={composerMode}
        onToggle={handleToggleComposer}
        description={description}
        onDescriptionChange={setDescription}
        onSubmit={handleSend}
        isSubmitting={isSubmitting}
        type={type}
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
      </MiNegocioChatComposer>

      {/* MODAL DE DETALLES */}
      <ItemDetailModal 
        item={itemForDetail}
        open={!!itemForDetail}
        onClose={() => setItemForDetail(null)}
        onEdit={(i) => { setItemForDetail(null); handleStartEdit(i); }}
        onDelete={(i) => { setItemForDetail(null); setDeleteId(i.id); }}
      />

      {/* MODAL ELIMINAR (CONFIRMACION) */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">¿Eliminar item?</h3>
            <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
              Esta acción ocultará el item de tu catálogo activo. Podrás recuperarlo luego si es necesario.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const target = items.find(i => i.id === deleteId);
                  if (target) handleDelete(target);
                  setDeleteId(null);
                }}
                className="w-full py-3 rounded-xl bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-100 active:scale-95 transition"
              >
                Eliminar definitivamente
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-500 text-xs font-bold active:scale-95 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE NOTIFICACIÓN */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[10001] ${toast.type === "success" ? "bg-green-600 shadow-green-100" : "bg-red-600 shadow-red-100"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
