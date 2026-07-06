"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  Clock,
  Search,
  ArrowDown,
  Calendar as CalendarIcon,
} from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { getCached, getInstantCache, invalidateCache } from "@/src/lib/cache";
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
  ItemInventoryMode,
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
import { getRecipesBulk } from "@/src/services/inventory";
import {
  MAX_ITEM_IMAGES,
  MAX_ITEM_IMAGE_SIZE_BYTES,
} from "@/src/lib/itemImages";

function MiNegocioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [recipeLineCounts, setRecipeLineCounts] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
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
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldStickToBottomRef = useRef(true);
  const isInitialLoadRef = useRef(true);
  const submitInFlightRef = useRef(false);

  // Composer / Form states
  const [composerMode, setComposerMode] = useState<
    "closed" | "create" | "edit"
  >("closed");
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [name, setName] = useState("");
  const [badgeText1, setBadgeText1] = useState("");
  const [badgeColor1, setBadgeColor1] = useState("#ef4444");
  const [badgeText2, setBadgeText2] = useState("");
  const [badgeColor2, setBadgeColor2] = useState("#ef4444");
  const [price, setPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("");
  const [appliesImpoconsumo, setAppliesImpoconsumo] = useState(false);
  const [impoconsumoRatePercent, setImpoconsumoRatePercent] = useState("");
  const [description, setDescription] = useState("");
  const [existingImages, setExistingImages] = useState<ItemImage[]>([]);
  const [newImages, setNewImages] = useState<PendingImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [imageUploadFailed, setImageUploadFailed] = useState(false);
  const [duration, setDuration] = useState(60);
  const [durationInput, setDurationInput] = useState("1");
  const [durationAdjustmentMessage, setDurationAdjustmentMessage] = useState<
    string | null
  >(null);
  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [inventoryMode, setInventoryMode] = useState<ItemInventoryMode>("NONE");
  const [saleConcept, setSaleConcept] = useState<"GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER">("GOODS");

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      const dbStatus = "ACTIVE";
      const key = `mi-negocio:items:${dbStatus}`;
      const hasInstant = !!getInstantCache<Item[]>(key, 60_000);

      if (!hasInstant && isInitial) {
        setLoading(true);
      }

      const data = await getCached(key, 60_000, () =>
        api<Item[]>(`/items?status=ACTIVE&lightweight=true`),
      );

      const sorted = [...data].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
      setItems(sorted);

      const recipeItems = sorted.filter(
        (item) =>
          item.type === "PRODUCT" && item.inventoryMode === "RECIPE_BASED",
      );
      const recipesByItemId = await getRecipesBulk(
        recipeItems.map((item) => item.id),
      );
      setRecipeLineCounts(
        Object.fromEntries(
          recipeItems.map((item) => [
            item.id,
            recipesByItemId[item.id]?.length ?? 0,
          ]),
        ),
      );
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

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
    setAppliesImpoconsumo(false);
    setImpoconsumoRatePercent("");
    setDescription("");
    setNewImages([]);
    setExistingImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setPendingImageFile(null);
    setCreatedItemId(null);
    setImageUploadFailed(false);
    setDuration(60);
    setDurationInput("1");
    setDurationAdjustmentMessage(null);
    setWeek(createInitialWeek());
    setCurrentDayIndex(0);
    setFormErrors({});
    setType("PRODUCT");
    setInventoryMode("NONE");
    setSaleConcept("GOODS");
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
    setCreatedItemId(item.id);
    setImageUploadFailed(false);
    setComposerMode("edit");

    setType(item.type);
    setSaleConcept(item.saleConcept || (item.type === "SERVICE" ? "SERVICES" : "GOODS"));
    const nextInventoryMode: ItemInventoryMode =
      item.type === "SERVICE" ? "NONE" : (item.inventoryMode ?? "NONE");
    setInventoryMode(nextInventoryMode);
    setName(item.name);

    const badges = getItemBadges(item);
    setBadgeText1(badges[0]?.text ?? "");
    setBadgeColor1(badges[0]?.color ?? "#ef4444");
    setBadgeText2(badges[1]?.text ?? "");
    setBadgeColor2(badges[1]?.color ?? "#ef4444");

    setPrice(String(item.price));
    setPriceDisplay(formatPriceInput(String(item.price).replace(".", ",")));
    setAppliesImpoconsumo(Boolean(item.appliesImpoconsumo));
    setImpoconsumoRatePercent(
      item.impoconsumoRate == null
        ? ""
        : String(Number(item.impoconsumoRate) * 100),
    );
    setDescription(item.description ?? "");
    setExistingImages(item.images ?? []);
    setNewImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setPendingImageFile(null);
    setDuration(item.durationMinutes ?? 60);
    setDurationInput(
      item.durationMinutes ? String(item.durationMinutes / 60) : "1",
    );
    setDurationAdjustmentMessage(null);

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

  useEffect(() => {
    const itemId = searchParams.get("itemId") ?? searchParams.get("editItem");
    if (!itemId || !items.length) return;
    const item = items.find((candidate) => candidate.id === itemId);
    if (item) {
      handleStartEdit(item);
      router.replace("/mi-negocio", { scroll: false });
    }
  }, [items, router, searchParams]);

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);

    const fileWithLargeSize = selectedFiles.find((file) => file.size > 2 * 1024 * 1024);
    if (fileWithLargeSize) {
      setImageError("El peso máximo de la imagen es de 2 MB");
      return;
    }

    const totalImages = existingImages.length + newImages.length;
    const availableSlots = MAX_ITEM_IMAGES - totalImages;

    if (availableSlots <= 0) {
      setImageError(`Puedes subir hasta ${MAX_ITEM_IMAGES} imágenes.`);
      return;
    }

    setImageError(null);

    const nextPendingImages: PendingImage[] = [];
    selectedFiles.slice(0, availableSlots).forEach((file) => {
      nextPendingImages.push({
        id: generateCreationId(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });
    const nextImages = [...newImages, ...nextPendingImages];
    setNewImages(nextImages);
    setPendingImageFile(nextImages[0]?.file ?? null);
    setImageUploadFailed(false);
  };

  const handleRemoveExistingImage = (id: string) => {
    setExistingImages((prev) => prev.filter((img) => img.id !== id));
    setRemovedImageIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleRemoveNewImage = (id: string) => {
    const image = newImages.find((candidate) => candidate.id === id);
    if (image) URL.revokeObjectURL(image.previewUrl);

    const nextImages = newImages.filter((candidate) => candidate.id !== id);
    setNewImages(nextImages);
    setPendingImageFile(nextImages[0]?.file ?? null);
    if (nextImages.length === 0) setImageUploadFailed(false);
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    } else {
      const el = scrollRef.current;
      if (!el) return;
      window.requestAnimationFrame(() => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior,
        });
      });
    }
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

  const handleSend = async () => {
    if (isSubmitting || submitInFlightRef.current) return;

    if (type === "SERVICE") {
      const hasOverlap = week.some((day) => {
        if (!day.active || day.ranges.length !== 2) return false;
        const m1s = timeToMinutes(day.ranges[0].start);
        const m1e = timeToMinutes(day.ranges[0].end);
        const m2s = timeToMinutes(day.ranges[1].start);
        const m2e = timeToMinutes(day.ranges[1].end);

        const first = m1s <= m2s ? { s: m1s, e: m1e } : { s: m2s, e: m2e };
        const second = m1s <= m2s ? { s: m2s, e: m2e } : { s: m1s, e: m1e };
        return first.e >= second.s;
      });

      if (hasOverlap) return;
    }

    const errors: FormErrors = {};
    if (!name.trim()) errors.name = "El nombre es obligatorio";
    if (!price || parseFloat(price) <= 0) {
      errors.price = "El precio debe ser mayor a 0";
    }
    const parsedImpoconsumoRate = impoconsumoRatePercent
      ? Number(impoconsumoRatePercent.replace(",", "."))
      : null;
    if (
      type === "PRODUCT" &&
      appliesImpoconsumo &&
      parsedImpoconsumoRate !== null &&
      (!Number.isFinite(parsedImpoconsumoRate) ||
        parsedImpoconsumoRate <= 0 ||
        parsedImpoconsumoRate > 100)
    ) {
      errors.impoconsumoRate = "La tarifa debe ser mayor a 0 y máximo 100";
    }

    let finalDuration = duration;
    if (type === "SERVICE") {
      const n = parseFloat(durationInput);
      if (!durationInput || isNaN(n)) {
        finalDuration = 60;
        setDuration(60);
        setDurationInput("1");
        setDurationAdjustmentMessage(null);
      } else {
        let rounded = Math.round(n);
        if (rounded <= 0) rounded = 1;
        finalDuration = rounded * 60;
        setDuration(finalDuration);
        setDurationInput(String(rounded));
        if (n !== rounded) {
          setDurationAdjustmentMessage(
            `La duración se ha ajustado a ${rounded} hora(s)`,
          );
        } else {
          setDurationAdjustmentMessage(null);
        }
      }
      if (finalDuration < 5) errors.duration = "Mínimo 5 min";
      if (!week.some((d) => d.active && d.ranges.length > 0)) {
        errors.schedule = "Selecciona al menos un día con horario";
      }
    }

    if (type === "SERVICE" && inventoryMode !== "NONE") {
      setInventoryMode("NONE");
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    submitInFlightRef.current = true;
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
                : [],
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
        saleConcept,
        appliesImpoconsumo: type === "PRODUCT" && appliesImpoconsumo,
        impoconsumoRate:
          type === "PRODUCT" &&
          appliesImpoconsumo &&
          parsedImpoconsumoRate !== null
            ? parsedImpoconsumoRate / 100
            : null,
        description: description.trim() || null,
        durationMinutes: type === "SERVICE" ? finalDuration : null,
        inventoryMode: type === "SERVICE" ? "NONE" : inventoryMode,
        schedule,
        badges: nextBadges.length ? nextBadges : null,
        badgeText: finalBadgeText,
        badgeColor: finalBadgeColor || (finalBadgeText ? "#ef4444" : null),
      };

      let savedItem: Item;
      let failedImages: PendingImage[] = [];
      let targetItemId = editingItem?.id ?? createdItemId;
      const wasCreating = !targetItemId;

      if (targetItemId) {
        savedItem = await api<Item>(`/items/${targetItemId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        for (const id of removedImageIds) {
          await api(`/items/${targetItemId}/images/${id}`, {
            method: "DELETE",
          });
        }

        for (const img of newImages) {
          const formData = new FormData();
          formData.append("file", img.file);
          try {
            await api(`/items/${targetItemId}/images/upload`, {
              method: "POST",
              body: formData,
            });
          } catch (error) {
            console.error(error);
            failedImages.push(img);
          }
        }

        try {
          savedItem = await api<Item>(`/items/${targetItemId}`);
        } catch (error) {
          console.error(error);
        }
      } else {
        const created = await api<Item>(`/items`, {
          method: "POST",
          body: JSON.stringify({ ...body, id: generateCreationId() }),
        });

        savedItem = created;
        targetItemId = created.id;

        setCreatedItemId(created.id);
        setEditingItem(created);
        setComposerMode("edit");
        setImageUploadFailed(false);

        for (const img of newImages) {
          const formData = new FormData();
          formData.append("file", img.file);
          try {
            await api(`/items/${created.id}/images/upload`, {
              method: "POST",
              body: formData,
            });
          } catch (error) {
            console.error(error);
            failedImages.push(img);
          }
        }

        if (failedImages.length === 0) {
          try {
            savedItem = await api<Item>(`/items/${created.id}`);
          } catch (error) {
            console.error(error);
          }
        }
      }

      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");

      setItems((prev) => {
        const exists = prev.find((i) => i.id === savedItem.id);
        if (exists) {
          return prev.map((i) => (i.id === savedItem.id ? savedItem : i));
        }
        return [savedItem, ...prev];
      });

      shouldStickToBottomRef.current = true;

      if (failedImages.length > 0) {
        setCreatedItemId(targetItemId);
        setImageUploadFailed(true);
        setPendingImageFile(failedImages[0]?.file ?? pendingImageFile);
        setToast({
          message:
            type === "SERVICE"
              ? "Servicio creado, pero no se pudo subir la imagen. Podés reintentar la imagen sin crear otro servicio."
              : "Producto creado, pero no se pudo subir la imagen. Podés reintentar la imagen sin crear otro producto.",
          type: "error",
        });
        setEditingItem(savedItem);
        setComposerMode("edit");
        setExistingImages(savedItem.images ?? existingImages);
        setNewImages(failedImages);
        setRemovedImageIds([]);
        return;
      }

      setToast({
        message: wasCreating ? "Item creado" : "Item actualizado",
        type: "success",
      });
      setImageUploadFailed(false);
      setPendingImageFile(null);
      setComposerMode("closed");
      resetForm();
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al guardar", type: "error" });
    } finally {
      submitInFlightRef.current = false;
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
      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      setToast({ message: "Item eliminado", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al eliminar", type: "error" });
    }
  };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    shouldStickToBottomRef.current = nearBottom;
    setIsAtBottom(nearBottom);
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


  const hasScheduleOverlap = type === "SERVICE" && week.some((day) => {
    if (!day.active || day.ranges.length !== 2) return false;
    const m1s = timeToMinutes(day.ranges[0].start);
    const m1e = timeToMinutes(day.ranges[0].end);
    const m2s = timeToMinutes(day.ranges[1].start);
    const m2e = timeToMinutes(day.ranges[1].end);
    const first = m1s <= m2s ? { s: m1s, e: m1e } : { s: m2s, e: m2e };
    const second = m1s <= m2s ? { s: m2s, e: m2e } : { s: m1s, e: m1e };
    return first.e >= second.s;
  });

  return (
    <div className="flex flex-col min-h-screen bg-white lg:h-[100dvh] lg:overflow-hidden">
      <AppHeader title="Mi negocio" showBack={true} hrefBack="/home" />

      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col-reverse gap-8 pb-32 lg:pb-[140px]"
      >
        <div ref={messagesEndRef} className="h-px" />

        {groupedItems.map((group) => (
          <div key={group.dateLabel} className="space-y-4">
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] flex-1 bg-neutral-200" />
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">
                {group.dateLabel}
              </span>
              <div className="h-[1px] flex-1 bg-neutral-200" />
            </div>

            <div className="flex flex-col-reverse gap-4">
              {group.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleStartEdit(item)}
                  onDelete={() => setDeleteId(item.id)}
                  onView={() => setItemForDetail(item)}
                  recipeLineCount={recipeLineCounts[item.id] ?? 0}
                />
              ))}
            </div>
          </div>
        ))}

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

        {composerMode === "closed" &&
          searchQuery.trim() !== "" &&
          filteredItems.length === 0 && (
            <div className="text-center py-20 px-6 animate-in fade-in zoom-in-95 duration-300 flex flex-col justify-center items-center">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4 border border-neutral-100/50">
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

        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest">
            No hay items creados
          </div>
        )}

        {loading && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">
            Cargando...
          </div>
        )}
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
        submitDisabled={hasScheduleOverlap}
      >
        <ItemFormContent
          type={type}
          setType={setType}
          inventoryMode={inventoryMode}
          setInventoryMode={setInventoryMode}
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
          appliesImpoconsumo={appliesImpoconsumo}
          setAppliesImpoconsumo={setAppliesImpoconsumo}
          impoconsumoRatePercent={impoconsumoRatePercent}
          setImpoconsumoRatePercent={setImpoconsumoRatePercent}
          durationInput={durationInput}
          setDurationInput={setDurationInput}
          setDuration={setDuration}
          durationAdjustmentMessage={durationAdjustmentMessage}
          setDurationAdjustmentMessage={setDurationAdjustmentMessage}
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
          saleConcept={saleConcept}
          setSaleConcept={setSaleConcept}
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
        recipeLineCount={
          itemForDetail ? (recipeLineCounts[itemForDetail.id] ?? 0) : 0
        }
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
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[10001] ${toast.type === "success" ? "bg-green-600 shadow-green-100" : "bg-red-600 shadow-red-100"
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function MiNegocioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen bg-white">
          <AppHeader title="Mi negocio" showBack={true} hrefBack="/home" />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-neutral-400 font-medium text-[10px] uppercase tracking-widest animate-pulse">
              Cargando mi negocio...
            </div>
          </main>
        </div>
      }
    >
      <MiNegocioPageContent />
    </Suspense>
  );
}
