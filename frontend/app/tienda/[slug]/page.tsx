"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Store,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";
import { formatLocalDateKey } from "@/src/lib/datetime";
import { formatPriceInput } from "@/src/lib/itemHelpers";

const formatPrice = (value: number) => {
  return formatPriceInput(value.toFixed(2).replace(".", ","));
};

const formatCop = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(safeValue);
  return formatted.replace("COP", "$").replace(/\s+/g, "");
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  description?: string;
  durationMinutes?: number;
  previousPrice?: number | null;
  images?: { id: string; url: string }[];
};

export default function PublicStorePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";
  const router = useRouter();
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCartModal, setShowCartModal] = useState(false);

  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [category, setCategory] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const closeProductDetail = () => setSelectedProduct(null);

  useEffect(() => {
    if (!selectedProduct) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProductDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedProduct]);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${API_URL}/public/${slug}/items?type=${category}`
        );

        if (!res.ok) throw new Error("Error loading items");

        const data = await res.json();
        
        // Redirección Canónica
        if (data?.business?.slug && data.business.slug !== slug) {
          const params = new URLSearchParams(searchParams.toString());
          router.replace(`/tienda/${data.business.slug}${params.toString() ? `?${params.toString()}` : ''}`);
          return;
        }

        const itemsList = Array.isArray(data?.data) ? data.data : [];

        if (data?.business?.name) {
          setBusinessName(data.business.name);
        }

        setItems(
          itemsList.map((item: any) => ({
            ...item,
            price: Number(item.price || 0),
            previousPrice:
              item.previousPrice != null
                ? Number(item.previousPrice)
                : item.compareAtPrice != null
                  ? Number(item.compareAtPrice)
                  : item.originalPrice != null
                    ? Number(item.originalPrice)
                    : null,
          }))
        );
      } catch (error) {
        console.error("Fetch items error:", error);
        notify({
          type: "error",
          message: "No se pudieron cargar los productos",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [slug, category, notify]);

  const resetReservationUi = () => {
    setSelectedService(null);
    setAvailableSlots([]);
    setAvailableDates([]);
    setSelectedDateKey(null);
  };

  const handleDateChange = async (date: Date) => {
    if (!selectedService || !slug) return;

    const formatted = formatLocalDateKey(date);
    setSelectedDateKey(formatted);

    try {
      const res = await fetch(
        `${API_URL}/public/${slug}/availability?itemId=${selectedService.id}&date=${formatted}`
      );

      if (!res.ok) throw new Error("Error fetching availability");

      const data = await res.json();
      setAvailableSlots(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Availability error:", error);
      setAvailableSlots([]);
    }
  };

  const handleMonthChange = async (date: Date) => {
    if (!selectedService || !slug) return;

    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    try {
      const res = await fetch(
        `${API_URL}/public/${slug}/availability-calendar?itemId=${selectedService.id}&month=${month}`
      );

      if (!res.ok) throw new Error("Error fetching availability calendar");

      const data = await res.json();
      setAvailableDates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Availability calendar error:", error);
      setAvailableDates([]);
    }
  };

  const handleReserve = async (data: any) => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las reservas estan deshabilitadas",
      });
      return;
    }

    if (!selectedService || !data.time || !data.date) return;

    const service = selectedService;
    const [h, m] = data.time.split(":").map(Number);
    const startMinute = h * 60 + m;
    const endMinute = startMinute + (service.durationMinutes ?? 60);

    try {
      const res = await fetch(`${API_URL}/public/${slug}/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: service.id,
          customerName: data.fullName,
          customerWhatsapp: data.whatsapp,
          date: formatLocalDateKey(data.date),
          startMinute,
          endMinute,
        }),
      });

      if (!res.ok) throw new Error("Error creating reservation");

      notify({
        type: "success",
        message: "Reserva creada correctamente",
      });

      resetReservationUi();
    } catch (error) {
      console.error("Reservation error:", error);
      notify({
        type: "error",
        message: "No se pudo crear la reserva",
      });
    }
  };

  const addToCart = (id: string) => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las compras estan deshabilitadas",
      });
      return;
    }

    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    notify({ type: "success", message: "Producto agregado" });
  };

  const increaseQty = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: prev[id] + 1 }));
  };

  const decreaseQty = (id: string) => {
    setCart((prev) => {
      if (prev[id] <= 1) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: prev[id] - 1 };
    });
  };

  const removeItem = (id: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        if (!item) return null;
        return { ...item, quantity: qty };
      })
      .filter(Boolean) as (Item & { quantity: number })[];
  }, [cart, items]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
  }, [cartItems]);

  const cartCount = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((i) => {
      const name = i.name?.toLowerCase() ?? "";
      const desc = i.description?.toLowerCase() ?? "";
      const typeLabel = i.type === "SERVICE" ? "servicio" : "producto";

      return (
        name.includes(q) ||
        desc.includes(q) ||
        typeLabel.includes(q)
      );
    });
  }, [items, query]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isSearchOpen]);

  const handleConfirmOrder = async () => {
    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: no se pueden realizar pedidos",
      });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/public/${slug}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerWhatsapp: `${countryCode}${phoneNumber}`,
          items: cartItems.map((item) => ({
            itemId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      if (!res.ok) throw new Error("Error sending order");

      notify({ type: "success", message: "Compra enviada" });

      setCart({});
      setShowCartModal(false);
      setCustomerName("");
      setPhoneNumber("");
    } catch (error) {
      console.error("Order error:", error);
      notify({ type: "error", message: "Error al enviar pedido" });
    }
  };

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
      <header
        className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[420px] items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold text-slate-950">
                {businessName || "Tienda"}
              </div>
              <div className="truncate text-[12px] font-medium text-slate-500">
                Catálogo
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-slate-100 active:scale-95"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowCartModal(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-slate-100 active:scale-95"
              aria-label="Carrito"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-black text-white shadow-sm">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px] px-4 pb-3 space-y-3">
          {isSearchOpen && (
            <div className="flex items-center gap-3 rounded-full bg-slate-50 px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent text-sm outline-none text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setIsSearchOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:scale-95"
                aria-label="Cerrar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {["", "PRODUCT", "SERVICE"].map((type) => (
              <button
                key={type}
                onClick={() => setCategory(type)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ring-1 transition ${category === type
                  ? "bg-[#11d473] text-white ring-emerald-200"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
              >
                {type === ""
                  ? "Todo"
                  : type === "PRODUCT"
                    ? "Productos"
                    : "Servicios"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {preview && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 font-medium">
          Modo administrador - vista previa de la tienda
        </div>
      )}

      <main className="mx-auto w-full max-w-[420px] px-4 pb-28 pt-4">
        {loading ? (
          <p className="text-center mt-6 text-neutral-400">Cargando...</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                preview={preview}
                onOpen={() =>
                  item.type === "SERVICE" ? setSelectedService(item) : setSelectedProduct(item)
                }
                onPlus={() =>
                  item.type === "SERVICE" ? setSelectedService(item) : addToCart(item.id)
                }
              />
            ))}
          </div>
        )}
      </main>

      {/* Cart entry now lives in the header */}

      {showCartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCartModal(false)}
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-xl z-10">
            <h2 className="text-lg font-semibold mb-4">
              Finalizar compra
            </h2>

            {cartItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center mb-3"
              >
                <div>
                  <div className="font-medium">
                    {item.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    ${formatPrice(item.price)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decreaseQty(item.id)}
                    className="px-2 border rounded"
                  >
                    -
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    onClick={() => increaseQty(item.id)}
                    className="px-2 border rounded"
                  >
                    +
                  </button>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-500 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            <div className="flex justify-between font-semibold mt-4">
              <span>Total</span>
              <span>${formatPrice(cartTotal)}</span>
            </div>

            <div className="mt-4 space-y-3">
              <input
                placeholder="Nombre"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
              />

              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-[95px] border rounded-xl px-3 py-3 text-sm bg-white"
                >
                  <option value="57">🇨🇴 +57</option>
                  <option value="54">🇦🇷 +54</option>
                  <option value="52">🇲🇽 +52</option>
                  <option value="34">🇪🇸 +34</option>
                  <option value="56">🇨🇱 +56</option>
                  <option value="51">🇵🇪 +51</option>
                </select>

                <input
                  placeholder="WhatsApp"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 border rounded-xl px-4 py-3"
                />
              </div>
              <p className="text-xs text-gray-400 -mt-1 px-1">
                Usaremos este número para confirmar tu pedido
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCartModal(false)}
                className="flex-1 border rounded-xl py-3"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmOrder}
                className="flex-1 bg-emerald-600 text-white rounded-xl py-3"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <ReservationDrawer
        open={!!selectedService}
        onClose={resetReservationUi}
        title={selectedService?.name}
        subtitle="Selecciona dia y horario disponible"
        timeSlots={availableSlots}
        availableDates={availableDates}
        selectedDateValue={selectedDateKey}
        onDateChange={handleDateChange}
        onMonthChange={handleMonthChange}
        onConfirm={handleReserve}
      />

      <ProductDetailOverlay
        open={!!selectedProduct}
        item={selectedProduct}
        businessName={businessName}
        preview={preview}
        onClose={closeProductDetail}
        onPrimaryAction={() => {
          if (!selectedProduct) return;
          if (preview) {
            notify({
              type: "info",
              message: "Modo administrador: las compras estan deshabilitadas",
            });
            return;
          }
          addToCart(selectedProduct.id);
          closeProductDetail();
        }}
      />
    </div>
  );
}

function ProductCard({
  item,
  onOpen,
  onPlus,
  preview,
}: {
  item: Item;
  onOpen: () => void;
  onPlus: () => void;
  preview?: boolean;
}) {
  const images = item.images ?? [];
  const imageCount = images.length;
  const showCarousel = imageCount > 1;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item.id]);

  useEffect(() => {
    if (!showCarousel) return;

    const id = window.setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % imageCount);
    }, 3000);

    return () => window.clearInterval(id);
  }, [showCarousel, imageCount]);

  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden rounded-3xl bg-neutral-100 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen();
            }
          }}
          className="block w-full cursor-pointer"
          aria-label={`Ver ${item.name}`}
        >
          <div className="aspect-square w-full">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full bg-neutral-200" />
            )}
          </div>

          {showCarousel && (
            <div className="absolute left-3 right-3 top-3 z-10 flex gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
              {images.map((image, index) => (
                <button
                  key={image.id ?? `${item.id}-seg-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setCurrentImageIndex(index);
                  }}
                  className={[
                    "h-0.5 flex-1 rounded-full",
                    index === currentImageIndex
                      ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                      : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                  ].join(" ")}
                  aria-label={`Imagen ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={preview}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPlus();
          }}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={item.type === "SERVICE" ? "Reservar" : "Agregar al carrito"}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 space-y-1 px-1">
        <div className="truncate text-[14px] font-bold text-slate-950">
          {item.name}
        </div>
        <div className="text-[15px] font-black text-emerald-600">
          {formatCop(item.price)}
        </div>
      </div>
    </div>
  );
}

function ProductDetailOverlay({
  open,
  item,
  businessName,
  preview,
  onClose,
  onPrimaryAction,
}: {
  open: boolean;
  item: Item | null;
  businessName: string;
  preview: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = item?.images ?? [];
  const imageCount = images.length;
  const showCarousel = imageCount > 1;

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item?.id]);

  const goToIndex = (index: number) => {
    if (!showCarousel) return;
    const clamped = Math.max(0, Math.min(index, imageCount - 1));
    setCurrentImageIndex(clamped);
  };

  const goPrev = () => goToIndex((currentImageIndex - 1 + imageCount) % imageCount);
  const goNext = () => goToIndex((currentImageIndex + 1) % imageCount);

  useEffect(() => {
    if (!open || !showCarousel) return;

    const id = window.setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % imageCount);
    }, 3000);

    return () => window.clearInterval(id);
  }, [open, showCarousel, imageCount]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Cerrar detalle"
      />

      <div className="relative h-[100dvh] w-full">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-900 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white/90 md:hidden"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="h-full w-full md:hidden">
          <ReelLikeProductView
            item={item}
            businessName={businessName}
            preview={preview}
            onPrimaryAction={onPrimaryAction}
            currentImageIndex={currentImageIndex}
            onSelectImage={goToIndex}
            onPrev={goPrev}
            onNext={goNext}
          />
        </div>

        <div className="hidden h-full md:flex">
          {/* LEFT: commercial info */}
          <div className="min-w-0 flex-1 bg-[#F7FAF8] px-12 py-10">
            <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
              <div className="max-w-2xl space-y-8 text-slate-900">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a la tienda
                </button>

                <div className="space-y-2">
                  <h1 className="text-5xl font-semibold tracking-tight leading-[1.05]">
                    {item.name}
                  </h1>
                  {businessName && (
                    <div className="text-base font-medium text-slate-600">
                      {businessName}
                    </div>
                  )}
                </div>

                <div className="h-px w-full bg-black/5" />

                <div className="flex flex-wrap items-end justify-between gap-8">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      PRECIO ESPECIAL
                    </div>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div className="text-4xl font-black tracking-tight text-slate-900">
                        ${formatPrice(item.price)}
                      </div>
                      {item.previousPrice != null &&
                        Number.isFinite(item.previousPrice) &&
                        item.previousPrice > item.price && (
                          <div className="text-base text-slate-400 line-through">
                            ${formatPrice(item.previousPrice)}
                          </div>
                        )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={preview}
                    onClick={onPrimaryAction}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#11d473] px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(17,212,115,0.35)] transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Comprar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-px w-full bg-black/5" />

                {item.description && (
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Descripción
                    </div>
                    <p className="text-[16px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                      {item.description}
                    </p>
                  </div>
                )}

                {/* <BenefitsList /> */}
              </div>
            </div>
          </div>

          {/* RIGHT: image only */}
          <div className="flex-1 bg-white">
            <DesktopProductImage
              item={item}
              currentImageIndex={currentImageIndex}
              onSelectImage={goToIndex}
              onPrev={goPrev}
              onNext={goNext}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopProductImage({
  item,
  currentImageIndex,
  onSelectImage,
  onPrev,
  onNext,
}: {
  item: Item;
  currentImageIndex: number;
  onSelectImage: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const images = item.images ?? [];
  const showCarousel = images.length > 1;
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  return (
    <div className="h-full w-full overflow-hidden bg-neutral-100">
      <div className="relative h-full w-full">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-neutral-200" />
        )}

        {showCarousel && (
          <>
            <div className="absolute left-6 right-6 top-6 z-10 flex gap-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
              {images.map((image, index) => (
                <button
                  key={image.id ?? `${item.id}-detail-seg-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectImage(index);
                  }}
                  className={[
                    "h-0.5 flex-1 rounded-full",
                    index === currentImageIndex
                      ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                      : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                  ].join(" ")}
                  aria-label={`Imagen ${index + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPrev();
              }}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onNext();
              }}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* function BenefitsList() {
  return (
    <div className="space-y-6 pt-2">
      <div className="h-px w-full bg-white/10" />

      <div className="space-y-5">
        <BenefitRow
          icon={<ShieldCheck className="h-5 w-5 text-white/70" />}
          title="Compra segura"
          subtitle="Tus datos están protegidos"
        />
        <BenefitRow
          icon={<Truck className="h-5 w-5 text-white/70" />}
          title="Envío rápido"
          subtitle="Recibe tu pedido en tiempo récord"
        />
        <BenefitRow
          icon={<RotateCcw className="h-5 w-5 text-white/70" />}
          title="Devoluciones"
          subtitle="30 días para cambios y devoluciones"
        />
      </div>
    </div>
  );
}

function BenefitRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-sm text-white/55">{subtitle}</div>
      </div>
    </div>
  );
}

} */

function ReelLikeProductView({
  item,
  businessName,
  preview,
  onPrimaryAction,
  currentImageIndex,
  onSelectImage,
  onPrev,
  onNext,
}: {
  item: Item;
  businessName: string;
  preview: boolean;
  onPrimaryAction: () => void;
  currentImageIndex: number;
  onSelectImage: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const images = item.images ?? [];
  const showCarousel = images.length > 1;
  const imageUrl = images[currentImageIndex]?.url ?? images[0]?.url;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F7FAF8]">
      {/* IMAGE (full-bleed, no margins, no radius) */}
      <div className="relative w-full bg-neutral-100">
        <div className="h-[52vh] min-h-[320px] w-full bg-neutral-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="h-full w-full bg-neutral-200" />
          )}
        </div>

        {showCarousel && (
          <>
            <div className="absolute left-3 right-3 top-3 z-10 flex gap-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
              {images.map((image, index) => (
                <button
                  key={image.id ?? `${item.id}-mobile-seg-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectImage(index);
                  }}
                  className={[
                    "h-0.5 flex-1 rounded-full",
                    index === currentImageIndex
                      ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.45)]"
                      : "bg-white/60 shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
                  ].join(" ")}
                  aria-label={`Imagen ${index + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={onPrev}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-950 shadow-lg ring-1 ring-black/10 backdrop-blur hover:bg-white"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* FOOTER (full width bar, no rounded “card”) */}
      <div className="flex w-full flex-wrap items-center justify-between gap-6 bg-white/85 px-5 py-4 backdrop-blur border-b border-black/5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            PRECIO ESPECIAL
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-3xl font-black tracking-tight text-slate-900">
              ${formatPrice(item.price)}
            </div>
            {item.previousPrice != null &&
              Number.isFinite(item.previousPrice) &&
              item.previousPrice > item.price && (
                <div className="ml-3 text-base text-slate-400 line-through">
                  ${formatPrice(item.previousPrice)}
                </div>
              )}
          </div>
        </div>

        <button
          type="button"
          disabled={preview}
          onClick={onPrimaryAction}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#11d473] px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(17,212,115,0.35)] transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag className="h-4 w-4" />
          Comprar
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* DESCRIPTION (padding only here; no heavy card) */}
      <div className="mx-auto min-h-0 w-full max-w-md overflow-y-auto px-4 pb-6 pt-4 custom-scrollbar">
        <div className="space-y-2 text-slate-900">
          {businessName && (
            <div className="text-xs font-semibold text-slate-600">
              {businessName}
            </div>
          )}

          {item.description && (
            <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">
              {item.description}
            </p>
          )}
        </div>

        {/*
        <div className="pt-6">
          <BenefitsList />
        </div>
        */}
      </div>
    </div>
  );
}
