"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Barcode, PackageSearch } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import { InventoryControlPanel, type InventoryAction } from "@/src/components/inventory/InventoryControlPanel";
import { InventoryQuickPanel } from "@/src/components/inventory/InventoryQuickPanel";
import { InventoryStockForm, type StockMovementType } from "@/src/components/inventory/InventoryStockForm";
import type { InventoryMovement } from "@/src/components/inventory/InventoryMovementFeed";
import { ItemFormContent } from "@/src/components/mi-negocio/ItemFormContent";
import { MiNegocioChatComposer } from "@/src/components/mi-negocio/MiNegocioChatComposer";
import { api } from "@/src/lib/api";
import { getCached, invalidateCache } from "@/src/lib/cache";
import {
  createInitialWeek,
  formatPriceInput,
  generateCreationId,
  parsePriceInput,
  timeToMinutes,
  WEEKDAY_ENUM,
} from "@/src/lib/itemHelpers";
import type { FormErrors, Item, ItemImage, ItemType, PendingImage, WeeklySchedule } from "@/src/types/item";

type ComposerContext = "create-item" | "stock";

function numericIdSeed(id: string) {
  return id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function inventoryFor(item: Item | null) {
  if (!item) return { stock: 0, averageCost: 0, value: 0 };
  const seed = numericIdSeed(item.id);
  const stock = 4 + (seed % 27);
  const averageCost = Math.max(1, Math.round(Number(item.price || 0) * 0.58));
  return {
    stock,
    averageCost,
    value: stock * averageCost,
  };
}

function buildMovements(item: Item | null): InventoryMovement[] {
  const name = item?.name ?? "Insumo";
  const inv = inventoryFor(item);
  const now = new Date();
  const day = (offset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    d.setHours(hour, 20, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: "alert-low",
      type: inv.stock <= 6 ? "LOW_STOCK_ALERT" : "SALE",
      itemName: name,
      detail: inv.stock <= 6 ? "El stock esta cerca del minimo operativo." : "Venta confirmada desde el modulo de ventas.",
      quantityImpact: inv.stock <= 6 ? 0 : -2,
      balance: inv.stock,
      totalValue: inv.value,
      createdAt: day(0, 17),
    },
    {
      id: "purchase-1",
      type: "PURCHASE",
      itemName: name,
      detail: "Compra registrada para reposicion.",
      quantityImpact: 12,
      balance: inv.stock + 2,
      unitCost: inv.averageCost,
      totalValue: (inv.stock + 2) * inv.averageCost,
      createdAt: day(1, 11),
    },
    {
      id: "sale-return-1",
      type: "SALE_RETURN",
      itemName: name,
      detail: "Devolucion de venta aplicada al kardex.",
      quantityImpact: 1,
      balance: inv.stock - 10,
      unitCost: inv.averageCost,
      totalValue: (inv.stock - 10) * inv.averageCost,
      createdAt: day(2, 15),
    },
    {
      id: "sale-1",
      type: "SALE",
      itemName: name,
      detail: "Salida por venta cerrada.",
      quantityImpact: -3,
      balance: inv.stock - 11,
      unitCost: inv.averageCost,
      totalValue: (inv.stock - 11) * inv.averageCost,
      createdAt: day(2, 10),
    },
    {
      id: "adjustment-1",
      type: "ADJUSTMENT_NEGATIVE",
      itemName: name,
      detail: "Ajuste por conteo fisico.",
      quantityImpact: -1,
      balance: inv.stock - 8,
      unitCost: inv.averageCost,
      totalValue: (inv.stock - 8) * inv.averageCost,
      createdAt: day(4, 13),
    },
  ];
}

export default function InventarioPage() {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [activePanel, setActivePanel] = useState<0 | 1>(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<"closed" | "create" | "edit">("closed");
  const [composerContext, setComposerContext] = useState<ComposerContext>("create-item");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [description, setDescription] = useState("");

  const [type, setType] = useState<ItemType>("PRODUCT");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("");
  const [existingImages, setExistingImages] = useState<ItemImage[]>([]);
  const [newImages, setNewImages] = useState<PendingImage[]>([]);
  const [, setRemovedImageIds] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [durationInput, setDurationInput] = useState("30");
  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [stockMovementType, setStockMovementType] = useState<StockMovementType>("PURCHASE");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [stockUnitCost, setStockUnitCost] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [activeAction, setActiveAction] = useState<InventoryAction>("PURCHASE");

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCached("inventario:items:ACTIVE", 60_000, () =>
        api<Item[]>("/items?status=ACTIVE&lightweight=true"),
      );
      setItems((data ?? []).filter((item) => item.type === "PRODUCT"));
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const fallbackItem = selectedItem ?? items[0] ?? null;
  const inventory = useMemo(() => inventoryFor(fallbackItem), [fallbackItem]);
  const movements = useMemo(() => buildMovements(fallbackItem), [fallbackItem]);

  const goToPanel = (panel: 0 | 1) => {
    setActivePanel(panel);
    carouselRef.current?.scrollTo({
      left: panel * carouselRef.current.clientWidth,
      behavior: "smooth",
    });
  };

  const resetItemForm = useCallback(() => {
    setType("PRODUCT");
    setName("");
    setPrice("");
    setPriceDisplay("");
    setDescription("");
    setExistingImages([]);
    setNewImages([]);
    setRemovedImageIds([]);
    setImageError(null);
    setDuration(30);
    setDurationInput("30");
    setWeek(createInitialWeek());
    setCurrentDayIndex(0);
    setFormErrors({});
  }, []);

  const openCreateItem = () => {
    resetItemForm();
    setComposerContext("create-item");
    setComposerMode("create");
    setName(searchValue.trim());
    setType("PRODUCT");
    setDescription("");
  };

  const openStockComposer = (movementType: StockMovementType) => {
    if (!selectedItem) return;
    setComposerContext("stock");
    setComposerMode("edit");
    setStockMovementType(movementType);
    setStockQuantity("1");
    setStockUnitCost(String(inventory.averageCost || ""));
    setStockReason("");
    setDescription(`Movimiento de stock para ${selectedItem.name}`);
  };

  const closeComposer = () => {
    setComposerMode("closed");
    setComposerContext("create-item");
    resetItemForm();
  };

  const handleToggleComposer = () => {
    if (composerMode !== "closed") {
      closeComposer();
      return;
    }
    openCreateItem();
  };

  const handleSearch = useCallback(() => {
    const query = searchValue.trim().toLowerCase();
    setHasSearched(true);
    if (!query) {
      setSelectedItem(null);
      return;
    }

    const found = items.find((item) => {
      return (
        item.id.toLowerCase() === query ||
        item.id.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        (item.description ?? "").toLowerCase().includes(query)
      );
    });

    setSelectedItem(found ?? null);
    if (found) {
      setSearchValue(found.name);
    }
  }, [items, searchValue]);

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError("Las imagenes de inventario se cargan desde Mi negocio.");
  };

  const handleRemoveExistingImage = (id: string) => {
    setExistingImages((prev) => prev.filter((img) => img.id !== id));
    setRemovedImageIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleRemoveNewImage = (id: string) => {
    setNewImages((prev) => prev.filter((img) => img.id !== id));
  };

  const submitNewItem = async () => {
    const errors: FormErrors = {};
    if (!name.trim()) errors.name = "El nombre es obligatorio";
    if (!price || Number(price) <= 0) errors.price = "El precio debe ser mayor a 0";

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
                ? day.ranges.map((range) => ({
                    weekday: WEEKDAY_ENUM[dayIndex],
                    startMinute: timeToMinutes(range.start),
                    endMinute: timeToMinutes(range.end),
                  }))
                : [],
            )
          : [];

      const savedItem = await api<Item>("/items", {
        method: "POST",
        body: JSON.stringify({
          id: generateCreationId(),
          type,
          name: name.trim(),
          price: Number(price),
          description: description.trim() || null,
          durationMinutes: type === "SERVICE" ? duration : null,
          schedule,
        }),
      });

      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("inventario:items:ACTIVE");
      setItems((prev) => [...prev, savedItem].filter((item) => item.type === "PRODUCT"));
      setSelectedItem(savedItem);
      setSearchValue(savedItem.name);
      setHasSearched(true);
      setToast("Insumo creado");
      closeComposer();
    } catch (error) {
      console.error(error);
      setToast("No se pudo crear el insumo");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setToast(null), 2200);
    }
  };

  const submitStockMovement = () => {
    setToast("Movimiento preparado para registrar cuando el backend de inventario este disponible");
    closeComposer();
    setTimeout(() => setToast(null), 2600);
  };

  const handleSubmit = () => {
    if (composerMode === "closed") {
      handleSearch();
      return;
    }

    if (composerContext === "stock") {
      submitStockMovement();
      return;
    }

    submitNewItem();
  };

  const handleAction = (action: InventoryAction) => {
    setActiveAction(action);
    if (fallbackItem) setSelectedItem(fallbackItem);
    if (action === "PURCHASE") openStockComposer("PURCHASE");
    if (action === "SALE") openStockComposer("ADJUSTMENT_NEGATIVE");
    if (action === "PURCHASE_RETURN") openStockComposer("ADJUSTMENT_NEGATIVE");
    if (action === "SALE_RETURN") openStockComposer("ADJUSTMENT_POSITIVE");
  };

  const handleScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const nextPanel = Math.round(el.scrollLeft / el.clientWidth) as 0 | 1;
    setActivePanel(nextPanel);
  };

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
        <AppHeader
          title="Inventario"
          subtitle={activePanel === 0 ? "Busqueda y carga rapida" : "Control operativo"}
          showBack
          hrefBack="/home"
          rightIcon={<Barcode className="h-5 w-5 text-emerald-600" />}
          onRightClick={() => {
            setToast("Escaner listo: ingresa o pega el codigo en el chat");
            setTimeout(() => setToast(null), 2200);
          }}
          rightAriaLabel="Escanear codigo"
        />
      </div>

      <div className="border-b border-black/5 bg-white px-4 py-2">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <button
            type="button"
            onClick={() => goToPanel(0)}
            className={`h-8 flex-1 rounded-full text-[11px] font-black uppercase tracking-widest transition ${
              activePanel === 0 ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            Carga
          </button>
          <button
            type="button"
            onClick={() => goToPanel(1)}
            className={`h-8 flex-1 rounded-full text-[11px] font-black uppercase tracking-widest transition ${
              activePanel === 1 ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            Control
          </button>
        </div>
      </div>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center text-neutral-400">
            <PackageSearch className="mb-3 h-8 w-8 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-widest">Cargando inventario...</p>
          </div>
        ) : (
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
          >
            <div className="h-full w-full shrink-0 snap-start overflow-y-auto custom-scrollbar pb-44">
              <InventoryQuickPanel
                query={searchValue}
                selectedItem={selectedItem}
                hasSearched={hasSearched}
                currentStock={inventoryFor(selectedItem).stock}
                averageCost={inventoryFor(selectedItem).averageCost}
                onScan={() => {
                  setToast("Escaner listo: ingresa o pega el codigo en el chat");
                  setTimeout(() => setToast(null), 2200);
                }}
                onRetry={() => {
                  setSelectedItem(null);
                  setHasSearched(false);
                  setSearchValue("");
                }}
                onCreate={openCreateItem}
                onStockLoad={() => openStockComposer("PURCHASE")}
                onStockAdjust={() => openStockComposer("ADJUSTMENT_POSITIVE")}
                onSelectItem={setSelectedItem}
              />
            </div>

            <div className="h-full w-full shrink-0 snap-start">
              <InventoryControlPanel
                averageCost={inventory.averageCost}
                inventoryValue={inventory.value}
                movements={movements}
                activeAction={activeAction}
                onAction={handleAction}
              />
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-10 flex items-center justify-between px-4">
          <button
            type="button"
            onClick={() => goToPanel(0)}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white/90 text-neutral-500 shadow-sm ring-1 ring-black/5 disabled:opacity-0"
            disabled={activePanel === 0}
            aria-label="Ver carga rapida"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToPanel(1)}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white/90 text-neutral-500 shadow-sm ring-1 ring-black/5 disabled:opacity-0"
            disabled={activePanel === 1}
            aria-label="Ver control"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </main>

      <MiNegocioChatComposer
        mode={composerMode}
        onToggle={handleToggleComposer}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        description={description}
        onDescriptionChange={setDescription}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        type={type}
      >
        {composerContext === "stock" ? (
          <InventoryStockForm
            quantity={stockQuantity}
            unitCost={stockUnitCost}
            reason={stockReason}
            movementType={stockMovementType}
            onQuantityChange={setStockQuantity}
            onUnitCostChange={setStockUnitCost}
            onReasonChange={setStockReason}
            onMovementTypeChange={setStockMovementType}
          />
        ) : (
          <ItemFormContent
            type={type}
            setType={setType}
            name={name}
            setName={setName}
            priceDisplay={priceDisplay}
            setPriceDisplay={(value) => {
              const formatted = formatPriceInput(value);
              setPriceDisplay(formatted);
              setPrice(parsePriceInput(formatted));
            }}
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
            editingItem={false}
          />
        )}
      </MiNegocioChatComposer>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[10001] -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
