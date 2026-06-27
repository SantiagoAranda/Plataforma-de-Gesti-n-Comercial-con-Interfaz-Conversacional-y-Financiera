"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
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
  FormErrors,
  ItemInventoryMode,
} from "@/src/types/item";
import {
  generateCreationId,
  formatPriceInput,
  minutesToTime,
  timeToMinutes,
  createInitialWeek,
  WEEKDAY_ENUM,
} from "@/src/lib/itemHelpers";
import { ItemPanelLayout } from "./ItemPanelLayout";
import { ItemFormContent } from "./ItemFormContent";
import { getItemBadges } from "@/src/lib/itemBadges";

interface ItemFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (item: Item) => void;
  editingItem: Item | null;
}

function revokePendingImages(images: PendingImage[]) {
  images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
}

export default function ItemFormModal({
  open,
  onClose,
  onSaved,
  editingItem,
}: ItemFormModalProps) {
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
  const [duration, setDuration] = useState(60);
  const [durationInput, setDurationInput] = useState("1");
  const [durationAdjustmentMessage, setDurationAdjustmentMessage] = useState<
    string | null
  >(null);
  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [inventoryMode, setInventoryMode] = useState<ItemInventoryMode>("NONE");

  const totalImages = existingImages.length + newImages.length;

  // Sync with editingItem
  useEffect(() => {
    if (editingItem) {
      setType(editingItem.type);
      setInventoryMode(
        editingItem.type === "SERVICE"
          ? "NONE"
          : (editingItem.inventoryMode ?? "NONE"),
      );
      setName(editingItem.name);

      const badges = getItemBadges(editingItem);
      setBadgeText1(badges[0]?.text ?? "");
      setBadgeColor1(badges[0]?.color ?? "#ef4444");
      setBadgeText2(badges[1]?.text ?? "");
      setBadgeColor2(badges[1]?.color ?? "#ef4444");

      setPrice(String(editingItem.price));
      setPriceDisplay(
        formatPriceInput(String(editingItem.price).replace(".", ",")),
      );
      setAppliesImpoconsumo(Boolean(editingItem.appliesImpoconsumo));
      setImpoconsumoRatePercent(
        editingItem.impoconsumoRate == null
          ? ""
          : String(Number(editingItem.impoconsumoRate) * 100),
      );
      setDescription(editingItem.description ?? "");
      setExistingImages(editingItem.images ?? []);
      setNewImages([]);
      setRemovedImageIds([]);
      setImageError(null);
      setDuration(editingItem.durationMinutes ?? 60);
      setDurationInput(
        editingItem.durationMinutes
          ? String(editingItem.durationMinutes / 60)
          : "1",
      );
      setDurationAdjustmentMessage(null);

      const nextWeek = createInitialWeek();
      if (editingItem.type === "SERVICE" && editingItem.schedule?.length) {
        nextWeek.forEach((d) => {
          d.active = false;
          d.ranges = [];
        });
        editingItem.schedule.forEach((slot) => {
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
    } else {
      resetForm();
    }
  }, [editingItem, open]);

  const resetForm = () => {
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
    revokePendingImages(newImages);
    setNewImages([]);
    setExistingImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setDuration(60);
    setDurationInput("1");
    setDurationAdjustmentMessage(null);
    setInventoryMode("NONE");
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
    if (selectedFiles.length > availableSlots)
      errors.push(`Puedes subir hasta ${MAX_ITEM_IMAGES} imágenes.`);
    if (rejectedBySize.length > 0)
      errors.push(
        `Máximo ${formatBytesToMb(MAX_ITEM_IMAGE_SIZE_BYTES)} por imagen.`,
      );
    setImageError(errors.length > 0 ? errors.join(" ") : null);
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

  const handleSend = async () => {
    if (isSubmitting) return;
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

      if (hasOverlap) {
        return;
      }
    }

    const errors: FormErrors = {};
    if (!name.trim()) errors.name = "El nombre es obligatorio";
    if (!price || parseFloat(price) <= 0)
      errors.price = "El precio debe ser mayor a 0";
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
        // compatibilidad legacy: badge 1
        badgeText: finalBadgeText,
        badgeColor: finalBadgeColor || (finalBadgeText ? "#ef4444" : null),
      };

      let savedItem: Item;
      if (editingItem) {
        // ── EDIT PATH ────────────────────────────────────────────────
        savedItem = await api<Item>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        for (const id of removedImageIds) {
          await api(`/items/${editingItem.id}/images/${id}`, {
            method: "DELETE",
          });
        }

        // Upload new images — abort on first failure (item already existed, no orphan risk).
        for (const img of newImages) {
          const formData = new FormData();
          formData.append("file", img.file);
          try {
            await api(`/items/${editingItem.id}/images/upload`, {
              method: "POST",
              body: formData,
            });
          } catch (uploadErr) {
            console.error("[ItemFormModal handleSend] Image upload failed on edit:", uploadErr);
            toast.error("Error al subir una imagen. El resto de los cambios se guardaron.");
            setIsSubmitting(false);
            return;
          }
        }

        savedItem = await api<Item>(`/items/${editingItem.id}`);
      } else {
        // ── CREATE PATH ──────────────────────────────────────────────
        // Step 1: create the item record.
        const created = await api<Item>(`/items`, {
          method: "POST",
          body: JSON.stringify({ ...body, id: generateCreationId() }),
        });

        // Step 2: upload images. On failure → rollback (deactivate the orphan record).
        for (const img of newImages) {
          const formData = new FormData();
          formData.append("file", img.file);
          try {
            await api(`/items/${created.id}/images/upload`, {
              method: "POST",
              body: formData,
            });
          } catch (uploadErr) {
            console.error("[ItemFormModal handleSend] Image upload failed on create — rolling back:", uploadErr);
            try {
              await api(`/items/${created.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: "INACTIVE" }),
              });
            } catch (rollbackErr) {
              console.error("[ItemFormModal handleSend] Rollback failed:", rollbackErr);
            }
            toast.error("Error al subir la imagen. No se guardó el ítem.");
            setIsSubmitting(false);
            return;
          }
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
      toast.error("Error al guardar item");
    } finally {
      setIsSubmitting(false);
    }
  };

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
    <ItemPanelLayout
      open={open}
      onClose={onClose}
      title={
        editingItem
          ? type === "PRODUCT"
            ? "Editar producto"
            : "Editar servicio"
          : type === "PRODUCT"
            ? "Nuevo producto"
            : "Nuevo servicio"
      }
      footer={
        <div className="flex justify-end">
          <button
            onClick={handleSend}
            disabled={isSubmitting || hasScheduleOverlap}
            className={`w-full py-4 rounded-xl bg-green-600 text-white font-medium shadow-lg flex items-center justify-center active:scale-95 transition ${
              isSubmitting || hasScheduleOverlap ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting
              ? "Guardando..."
              : editingItem
                ? "Guardar cambios"
                : "Crear ítem"}
          </button>
        </div>
      }
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
      />

      {/* DESCRIPCION (Sólo visible en el Modal por ahora, se moverá al ChatComposer) */}
      <div className="space-y-2 pb-4">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
            Descripción
          </label>
          <span
            className={`text-[9px] font-medium ${description.length >= 300 ? "text-red-500" : "text-neutral-400"}`}
          >
            {description.length}/300
          </span>
        </div>
        <textarea
          placeholder="Descripción (opcional)"
          rows={4}
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-2xl border border-neutral-100 bg-white p-4 text-sm shadow-sm outline-none resize-none focus:border-green-500 transition"
        />
      </div>
    </ItemPanelLayout>
  );
}
