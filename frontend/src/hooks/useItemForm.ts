"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/src/lib/api";
import { invalidateCache } from "@/src/lib/cache";
import { Item, ItemType, ItemImage, PendingImage, WeeklySchedule, FormErrors, ItemInventoryMode } from "@/src/types/item";
import { generateCreationId, createInitialWeek, WEEKDAY_ENUM, formatPriceInput, timeToMinutes, minutesToTime } from "@/src/lib/itemHelpers";
import { getItemBadges } from "@/src/lib/itemBadges";
import { catalogDraft, validateCatalog, durationInMinutes } from "@/src/lib/itemForm";
import { MAX_ITEM_IMAGES } from "@/src/lib/itemImages";

async function compressImageFile(file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.85): Promise<File> {
  if (!file || !file.type.startsWith("image/") || file.size < 300 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          // blob.type: Safari no exporta WebP y devuelve PNG.
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, `.${blob.type.split("/")[1]}`), {
            type: blob.type,
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        // JPEG no tiene transparencia: los PNG/WebP transparentes quedaban con fondo negro.
        file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}


type Notice = { message: string; type: "success" | "error" };
export function useItemForm(onSaved: (item: Item) => void, setToast: (notice: Notice) => void) {
  const submitInFlightRef = useRef(false);
  const loadRequest = useRef(0);
  const imageUrls = useRef(new Set<string>());
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  useEffect(() => {
    const urls = imageUrls.current;
    const requestState = loadRequest;
    return () => { ++requestState.current; urls.forEach(URL.revokeObjectURL); };
  }, []);
  // Composer / Form states
  const [composerMode, setComposerMode] = useState<
    "closed" | "create" | "edit"
  >("closed");
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [requiresAppointment, setRequiresAppointment] = useState(true);
  const [allowWalkIn, setAllowWalkIn] = useState(false);
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
  const [tab, setTab] = useState<"data" | "tax" | "qr">("data");
  const [catalog, setCatalog] = useState(() => catalogDraft());
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [durationMinutesInput, setDurationMinutesInput] = useState("0");
  const [durationInput, setDurationInput] = useState("1");
  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [inventoryMode, setInventoryMode] = useState<ItemInventoryMode>("NONE");
  const [saleConcept, setSaleConcept] = useState<"GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER">("GOODS");

  const resetForm = useCallback(() => {
    ++loadRequest.current;
    setIsLoadingDetail(false);
    imageUrls.current.forEach(URL.revokeObjectURL);
    imageUrls.current.clear();
    setTab("data");
    setCatalog(catalogDraft());
    setCatalogError(null);
    setDurationMinutesInput("0");
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
    setWeek(createInitialWeek());
    setCurrentDayIndex(0);
    setFormErrors({});
    setType("PRODUCT");
    setRequiresAppointment(true);
    setAllowWalkIn(false);
    setInventoryMode("NONE");
    setSaleConcept("GOODS");
    setEditingItem(null);
  }, []);

  const handleToggleComposer = () => {
    if (submitInFlightRef.current) return;
    if (composerMode !== "closed") {
      setComposerMode("closed");
      resetForm();
    } else {
      setComposerMode("create");
    }
  };

  const handleStartEdit = useCallback(async (candidate: Item | null) => {
    if (submitInFlightRef.current) return;
    resetForm();
    if (!candidate) { setComposerMode("create"); return; }
    const request = ++loadRequest.current;
    setIsLoadingDetail(true);
    setComposerMode("edit");
    let item: Item;
    try {
      item = await api<Item>(`/items/${encodeURIComponent(candidate.id)}`);
      if (request !== loadRequest.current) return;
    } catch {
      if (request === loadRequest.current) {
        setIsLoadingDetail(false);
        setComposerMode("closed");
        setToast({ message: "No se pudo cargar el detalle del ítem.", type: "error" });
      }
      return;
    }
    setIsLoadingDetail(false);
    if (!item) {
      setComposerMode("create");
      resetForm();
      return;
    }

    setEditingItem(item);
    setCreatedItemId(item.id);
    setImageUploadFailed(false);
    setComposerMode("edit");

    setCatalog(catalogDraft(item));
    setType(item.type);
    setRequiresAppointment(item.requiresAppointment ?? true);
    setAllowWalkIn(item.allowWalkIn ?? true);
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
      String(Math.floor((item.durationMinutes ?? 60) / 60)),
    );
    setDurationMinutesInput(String((item.durationMinutes ?? 60) % 60));

    const nextWeek = createInitialWeek();
    if (item.type === "SERVICE") {
      nextWeek.forEach((d) => {
        d.active = false;
        d.ranges = [];
      });
      (item.schedule ?? []).forEach((slot) => {
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
  }, [resetForm, setToast]);

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);

    if (selectedFiles.some((file) => !file.type.startsWith("image/"))) {
      setImageError("Selecciona archivos de imagen."); return;
    }
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
      const previewUrl = URL.createObjectURL(file);
      imageUrls.current.add(previewUrl);
      nextPendingImages.push({
        id: generateCreationId(),
        file,
        previewUrl,
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

  const handleSend = async () => {
    if (isSubmitting || isLoadingDetail || submitInFlightRef.current) return;

    if (type === "SERVICE" && requiresAppointment) {
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
    if (!price || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      errors.price = type === "SERVICE" && !requiresAppointment
        ? "Para guardar, activa Requiere agenda e introduce el precio interno en Precio. Después puedes desactivarla nuevamente."
        : "El precio debe ser mayor a 0";
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

    const catalogValidation = validateCatalog(catalog);
    setCatalogError(catalogValidation);
    if (catalogValidation) { setTab("data"); return; }
    let finalDuration = duration;
    if (type === "SERVICE") {
      const exactDuration = durationInMinutes(durationInput, durationMinutesInput);
      if (requiresAppointment && (exactDuration === null || exactDuration > 1440)) errors.duration = "Ingresa horas y minutos enteros (0–59), entre 5 y 1440 minutos.";
      if (exactDuration !== null) finalDuration = exactDuration;
      if (requiresAppointment && !week.some((d) => d.active && d.ranges.length > 0)) {
        errors.schedule = "Selecciona al menos un día con horario";
      }
    }

    if (type === "SERVICE" && inventoryMode !== "NONE") {
      setInventoryMode("NONE");
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setTab(errors.impoconsumoRate && !errors.name && !errors.price && !errors.duration && !errors.schedule ? "tax" : "data");
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
        ...catalogDraft(catalog),
        type,
        requiresAppointment: type === "SERVICE" && requiresAppointment,
        allowWalkIn: type === "SERVICE" && allowWalkIn,
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
        durationMinutes: type === "SERVICE"
          ? (!requiresAppointment && editingItem && editingItem.durationMinutes == null &&
              durationInput === "1" && durationMinutesInput === "0" ? undefined : finalDuration)
          : null,
        inventoryMode: type === "SERVICE" ? "NONE" : inventoryMode,
        schedule,
        badges: nextBadges.length ? nextBadges : null,
        badgeText: finalBadgeText,
        badgeColor: finalBadgeColor || (finalBadgeText ? "#ef4444" : null),
      };

      const failedImages: PendingImage[] = [];
      let targetItemId = editingItem?.id ?? createdItemId;
      const wasCreating = !targetItemId;
      let savedItem: Item;
      if (targetItemId) {
        savedItem = await api<Item>(`/items/${targetItemId}`, {
          method: "PATCH", body: JSON.stringify(body),
        });
      } else {
        savedItem = await api<Item>("/items", {
          method: "POST", body: JSON.stringify({ ...body, id: generateCreationId() }),
        });
        targetItemId = savedItem.id;
        setCreatedItemId(savedItem.id);
        setEditingItem(savedItem);
        setComposerMode("edit");
      }
      for (const id of removedImageIds) {
        await api(`/items/${targetItemId}/images/${id}`, { method: "DELETE" });
        setRemovedImageIds(ids => ids.filter(pending => pending !== id));
      }
      for (const img of newImages) {
        try {
          const fileToUpload = await compressImageFile(img.file);
          const formData = new FormData();
          formData.append("file", fileToUpload);
          await api(`/items/${targetItemId}/images/upload`, { method: "POST", body: formData });
          setNewImages(pending => pending.filter(entry => entry.id !== img.id));
          URL.revokeObjectURL(img.previewUrl);
          imageUrls.current.delete(img.previewUrl);
        } catch (error) {
          console.error(error);
          failedImages.push(img);
        }
      }
      // Always reconcile successful uploads, including partially failed batches.
      try {
        savedItem = await api<Item>(`/items/${targetItemId}`);
      } catch {
        invalidateCache("mi-negocio:items:ACTIVE");
        invalidateCache("home:businessActivity");
        setToast({ message: "El ítem se guardó, pero no pudimos actualizar su detalle. Reintenta para recuperarlo.", type: "error" });
        return;
      }
      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");

      onSaved(savedItem);

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
      setToast({ message: err instanceof Error ? err.message : "Error al guardar", type: "error" });
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };


  const contentProps = {
    requiresAppointment, setRequiresAppointment,
    tab, setTab, catalog, setCatalog, catalogError,
    priceValue: price && Number.isFinite(Number(price)) ? Number(price) : null,
    durationMinutesInput, setDurationMinutesInput,
    type: type,
    setType: setType,
    inventoryMode: inventoryMode,
    setInventoryMode: setInventoryMode,
    name: name,
    setName: setName,
    badgeText1: badgeText1,
    setBadgeText1: setBadgeText1,
    badgeColor1: badgeColor1,
    setBadgeColor1: setBadgeColor1,
    badgeText2: badgeText2,
    setBadgeText2: setBadgeText2,
    badgeColor2: badgeColor2,
    setBadgeColor2: setBadgeColor2,
    priceDisplay: priceDisplay,
    setPriceDisplay: setPriceDisplay,
    setPrice: setPrice,
    appliesImpoconsumo: appliesImpoconsumo,
    setAppliesImpoconsumo: setAppliesImpoconsumo,
    impoconsumoRatePercent: impoconsumoRatePercent,
    setImpoconsumoRatePercent: setImpoconsumoRatePercent,
    durationInput: durationInput,
    setDurationInput: setDurationInput,
    week: week,
    setWeek: setWeek,
    currentDayIndex: currentDayIndex,
    setCurrentDayIndex: setCurrentDayIndex,
    existingImages: existingImages,
    newImages: newImages,
    handleAddImages: handleAddImages,
    handleRemoveExistingImage: handleRemoveExistingImage,
    handleRemoveNewImage: handleRemoveNewImage,
    formErrors: formErrors,
    setFormErrors: setFormErrors,
    imageError: imageError,
    editingItem: !!editingItem,
    saleConcept: saleConcept,
    setSaleConcept: setSaleConcept,
  };
  return { requiresAppointment, setRequiresAppointment, allowWalkIn, composerMode, setComposerMode, type, setType, name, setName, badgeText1, setBadgeText1, badgeColor1, setBadgeColor1, badgeText2, setBadgeText2, badgeColor2, setBadgeColor2, price, setPrice, priceDisplay, setPriceDisplay, appliesImpoconsumo, setAppliesImpoconsumo, impoconsumoRatePercent, setImpoconsumoRatePercent, description, setDescription, existingImages, setExistingImages, newImages, setNewImages, removedImageIds, setRemovedImageIds, imageError, setImageError, pendingImageFile, setPendingImageFile, createdItemId, setCreatedItemId, imageUploadFailed, setImageUploadFailed, duration, setDuration, durationInput, setDurationInput, week, setWeek, currentDayIndex, setCurrentDayIndex, isSubmitting, setIsSubmitting, formErrors, setFormErrors, editingItem, setEditingItem, inventoryMode, setInventoryMode, saleConcept, setSaleConcept, resetForm, handleToggleComposer, handleStartEdit, handleAddImages, handleRemoveExistingImage, handleRemoveNewImage, handleSend, contentProps, isLoadingDetail, catalog, setCatalog, catalogError, durationMinutesInput, setDurationMinutesInput };
}
