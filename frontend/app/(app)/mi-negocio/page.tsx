"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Trash2, Search, ArrowDown } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { getCached, getInstantCache, invalidateCache } from "@/src/lib/cache";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";
import ItemDetailModal from "@/src/components/mi-negocio/ItemDetailModal";
import { MiNegocioChatComposer } from "@/src/components/mi-negocio/MiNegocioChatComposer";
import { ItemFormContent } from "@/src/components/mi-negocio/ItemFormContent";
import {
  Item,
  ItemType,
  ItemImage,
  PendingImage,
  WeeklySchedule,
  FormErrors,
} from "@/src/types/item";
import {
  generateCreationId,
  createInitialWeek,
  WEEKDAY_ENUM,
  formatPriceInput,
  timeToMinutes,
  minutesToTime,
} from "@/src/lib/itemHelpers";
import { getItemBadges } from "@/src/lib/itemBadges";
import {
  MAX_ITEM_IMAGES,
  MAX_ITEM_IMAGE_SIZE_BYTES,
} from "@/src/lib/itemImages";

export default function MiNegocioPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemForDetail, setItemForDetail] = useState<Item | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const shouldStickToBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  const [composerMode, setComposerMode] = useState<"closed" | "create" | "edit">("closed");
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [name, setName] = useState("");
  const [badgeText1, setBadgeText1] = useState("");
  const [badgeColor1, setBadgeColor1] = useState("#ef4444");
  const [badgeText2, setBadgeText2] = useState("");
  const [badgeColor2, setBadgeColor2] = useState("#ef4444");
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
      const dbStatus = "ACTIVE";
      const key = `mi-negocio:items:${dbStatus}`;
      const hasInstant = !!getInstantCache<Item[]>(key, 60_000);

      if (!hasInstant && isInitial) setLoading(true);

      const data = await getCached(key, 60_000, () =>
        api<Item[]>(`/items?status=ACTIVE&lightweight=true`)
      );

      const sorted = [...data].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
      );

      setItems(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleCount(12);
    fetchItems(true);
  }, [fetchItems]);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    return (
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const resetForm = useCallback(() => {
    setName("");
    setBadgeText1("");
    setBadgeColor1("#ef4444");
    setBadgeText2("");
    setBadgeColor2("#ef4444");
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
      return;
    }

    setComposerMode("create");
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

    setType(item.type);
    setName(item.name);

    const badges = getItemBadges(item);
    setBadgeText1(badges[0]?.text ?? "");
    setBadgeColor1(badges[0]?.color ?? "#ef4444");
    setBadgeText2(badges[1]?.text ?? "");
    setBadgeColor2(badges[1]?.color ?? "#ef4444");

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
      nextWeek.forEach((d) => {
        d.active = false;
        d.ranges = [];
      });

      item.schedule.forEach((slot) => {
        const dayIdx = WEEKDAY_ENUM.indexOf(slot.weekday);

        if (dayIdx !== -1) {
          nextWeek[dayIdx].active = true;
          nextWeek[dayIdx].ranges.push({
            start: minutesToTime(slot.startMinute),
            end: minutesToTime(slot.endMinute),
          });
        }
      });
    }

    setWeek(nextWeek);
    const firstActive = nextWeek.findIndex((d) => d.active);
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
    setExistingImages((prev) => prev.filter((img) => img.id !== id));
    setRemovedImageIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleRemoveNewImage = (id: string) => {
    setNewImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    window.requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!items.length) return;

    if (isInitialLoadRef.current) {
      scrollToBottom("auto");
      isInitialLoadRef.current = false;
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [items.length, loading, scrollToBottom]);

  const uploadPendingImages = async (itemId: string) => {
    for (const img of newImages) {
      const formData = new FormData();
      formData.append("file", img.file);

      await api(`/items/${itemId}/images/upload`, {
        method: "POST",
        body: formData,
      });
    }
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
      const schedule =
        type === "SERVICE"
          ? week.flatMap((day, dayIndex) =>
              day.active
                ? day.ranges.map((r) => ({
                    weekday: WEEKDAY_ENUM[dayIndex],
                    startMinute: timeToMinutes(r.start),
                    endMinute: timeToMinutes(r.end),
                  }))
                : []
            )
          : [];

      const cleanedBadgeText1 = badgeText1.trim();
      const cleanedBadgeColor1 = badgeColor1.trim();
      const cleanedBadgeText2 = badgeText2.trim();
      const cleanedBadgeColor2 = badgeColor2.trim();

      const nextBadges = [
        cleanedBadgeText1
          ? { text: cleanedBadgeText1, color: cleanedBadgeColor1 || "#ef4444" }
          : null,
        cleanedBadgeText2
          ? { text: cleanedBadgeText2, color: cleanedBadgeColor2 || "#ef4444" }
          : null,
      ].filter(Boolean) as Array<{ text: string; color: string }>;

      const finalBadgeText = nextBadges[0]?.text ?? null;
      const finalBadgeColor = nextBadges[0]?.color ?? null;

      const body = {
        type,
        name,
        price: parseFloat(price),
        description: description.trim() || null,
        durationMinutes: type === "SERVICE" ? duration : null,
        schedule,
        badges: nextBadges.length ? nextBadges : null,
        badgeText: finalBadgeText,
        badgeColor: finalBadgeColor || (finalBadgeText ? "#ef4444" : null),
      };

      let savedItem: Item;

      if (editingItem) {
        savedItem = await api<Item>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        for (const id of removedImageIds) {
          await api(`/items/${editingItem.id}/images/${id}`, {
            method: "DELETE",
          });
        }

        await uploadPendingImages(editingItem.id);

        savedItem = await api<Item>(`/items/${editingItem.id}`);
      } else {
        const created = await api<Item>("/items", {
          method: "POST",
          body: JSON.stringify({ ...body, id: generateCreationId() }),
        });

        await uploadPendingImages(created.id);

        savedItem = await api<Item>(`/items/${created.id}`);
      }

      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");

      setItems((prev) => {
        const exists = prev.find((i) => i.id === savedItem.id);
        if (exists) return prev.map((i) => (i.id === savedItem.id ? savedItem : i));
        return [...prev, savedItem];
      });

      if (selectedItem?.id === savedItem.id) setSelectedItem(savedItem);

      shouldStickToBottomRef.current = true;

      setToast({
        message: editingItem ? "Item actualizado" : "Item creado",
        type: "success",
      });

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

      setItems((prev) => prev.filter((i) => i.id !== item.id));
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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;

    shouldStickToBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom);
  }, []);

  const groupedItems = useMemo(() => {
    const groups: { dateLabel: string; items: Item[] }[] = [];
    const itemsToGroup = filteredItems.slice(0, visibleCount);

    itemsToGroup.forEach((item) => {
      const date = new Date(item.createdAt || Date.now());
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);

      let label = date.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
      });

      if (date.toDateString() === now.toDateString()) label = "HOY";
      else if (date.toDateString() === yesterday.toDateString()) label = "AYER";

      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.dateLabel === label) {
        lastGroup.items.push(item);
      } else {
        groups.push({ dateLabel: label, items: [item] });
      }
    });

    return groups;
  }, [filteredItems, visibleCount]);

  return (
    <div className="flex flex-col min-h-screen bg-white lg:h-[100dvh] lg:overflow-hidden">
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

      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-8 pb-32 lg:pb-[140px] scroll-smooth"
      >
        {loading && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">
            Cargando...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest">
            No hay items creados
          </div>
        )}

        {groupedItems.map((group) => (
          <div key={group.dateLabel} className="space-y-4">
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] flex-1 bg-neutral-200" />
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
                {group.dateLabel}
              </span>
              <div className="h-[1px] flex-1 bg-neutral-200" />
            </div>

            <div className="grid grid-cols-1 gap-4">
              {group.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={() =>
                    setSelectedItem((prev) => (prev?.id === item.id ? null : item))
                  }
                />
              ))}
            </div>
          </div>
        ))}

        {composerMode === "closed" &&
          searchQuery.trim() !== "" &&
          filteredItems.length === 0 && (
            <div className="text-center py-20 px-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-neutral-100/50">
                <Search className="h-6 w-6 text-neutral-300" />
              </div>
              <h3 className="text-neutral-900 font-bold text-sm mb-1">
                No se encontraron productos o servicios
              </h3>
              <p className="text-neutral-400 text-xs font-medium leading-relaxed">
                Probá con otro nombre o descripción
              </p>
            </div>
          )}

        {filteredItems.length > visibleCount && (
          <div className="flex justify-center pb-8 pt-2">
            <button
              onClick={() => setVisibleCount((prev) => prev + 12)}
              className="px-6 py-2.5 bg-white border border-neutral-100 text-neutral-500 font-bold rounded-full shadow-sm active:scale-95 transition text-[10px] uppercase tracking-widest"
            >
              Cargar más
            </button>
          </div>
        )}

        <div ref={messagesEndRef} className="h-px" />
      </main>

      <MiNegocioChatComposer
        mode={composerMode}
        onToggle={handleToggleComposer}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
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
          badgeText1={badgeText1}
          setBadgeText1={setBadgeText1}
          badgeColor1={badgeColor1}
          setBadgeColor1={setBadgeColor1}
          badgeText2={badgeText2}
          setBadgeText2={setBadgeText2}
          badgeColor2={badgeColor2}
          setBadgeColor2={setBadgeColor2}
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

      <ItemDetailModal
        item={itemForDetail}
        open={!!itemForDetail}
        onClose={() => setItemForDetail(null)}
        onEdit={(i) => {
          setItemForDetail(null);
          handleStartEdit(i);
        }}
        onDelete={(i) => {
          setItemForDetail(null);
          setDeleteId(i.id);
        }}
      />

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              ¿Eliminar item?
            </h3>
            <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
              Esta acción ocultará el item de tu catálogo activo. Podrás
              recuperarlo luego si es necesario.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const target = items.find((i) => i.id === deleteId);
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

      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom("smooth")}
          className="fixed bottom-24 right-6 z-40 bg-emerald-600 border border-emerald-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-[0_8px_30px_rgb(16,185,129,0.3)] animate-in fade-in slide-in-from-bottom-4 duration-300 active:scale-95"
          aria-label="Ir al final"
        >
          <ArrowDown size={20} strokeWidth={2.5} />
        </button>
      )}

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[10001] ${
            toast.type === "success"
              ? "bg-green-600 shadow-green-100"
              : "bg-red-600 shadow-red-100"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}