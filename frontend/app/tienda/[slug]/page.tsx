"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";
import { formatLocalDateKey } from "@/src/lib/datetime";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import AppHeader from "@/src/components/layout/AppHeader";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  description?: string;
  durationMinutes?: number;
  images?: { id: string; url: string }[];
};

export default function PublicStorePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCartModal, setShowCartModal] = useState(false);

  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [category, setCategory] = useState<string>("");

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
        const itemsList = Array.isArray(data?.data) ? data.data : [];

        if (data?.business?.name) {
          setBusinessName(data.business.name);
        }

        setItems(
          itemsList.map((item: any) => ({
            ...item,
            price: Number(item.price || 0),
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

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

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
      <AppHeader title={businessName || "Cargando..."} showBack={false} showLogout={false} />

      {preview && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 font-medium">
          Modo administrador - vista previa de la tienda
        </div>
      )}

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-4 flex gap-3">
          {["", "PRODUCT", "SERVICE"].map((type) => (
            <button
              key={type}
              onClick={() => setCategory(type)}
              className={`px-4 py-2 rounded-full text-sm ${category === type
                  ? "bg-emerald-600 text-white"
                  : "bg-white"
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

        {loading ? (
          <p className="text-center mt-6 text-neutral-400">Cargando...</p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                preview={preview}
                onAction={() =>
                  item.type === "SERVICE"
                    ? setSelectedService(item)
                    : addToCart(item.id)
                }
              />
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 && (
        <button
          onClick={() => setShowCartModal(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-emerald-600 text-white shadow-xl flex items-center justify-center"
        >
          <ShoppingBag />
          <span className="absolute -top-1 -right-1 bg-white text-emerald-600 text-xs font-bold rounded-full px-2">
            {cartCount}
          </span>
        </button>
      )}

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
                    ${item.price.toFixed(2)}
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
              <span>${cartTotal.toFixed(2)}</span>
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
    </div>
  );
}

function ProductCard({
  item,
  onAction,
  preview,
}: {
  item: Item;
  onAction: () => void;
  preview?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:-translate-y-1 h-full">

      {/* Imagen */}
      <div className="aspect-[4/3] bg-neutral-50 overflow-hidden rounded-t-xl relative shrink-0">
        {item.images?.[0]?.url && (
          <ItemImageViewer
            images={item.images}
            name={item.name}
            description={item.description}
            containerClassName="h-full w-full rounded-t-xl flex items-center justify-center cursor-pointer"
            imageClassName="h-full w-full object-cover"
          />
        )}
        
        {/* Overlays */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none z-10">
          <span className={`backdrop-blur-md bg-white/70 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${item.type === 'SERVICE' ? 'text-blue-700' : 'text-orange-700'}`}>
            {item.type === 'SERVICE' ? 'Servicio' : 'Producto'}
          </span>

          {item.type === 'SERVICE' && item.durationMinutes && (
            <span className="backdrop-blur-md bg-white/70 text-neutral-800 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm leading-none">
              {item.durationMinutes} min
            </span>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-3 flex flex-col gap-2 flex-1 relative">

        {/* Nombre */}
        <div className="text-sm font-semibold text-neutral-900 line-clamp-1">
          {item.name}
        </div>

        {/* Descripción */}
        <div className="flex-1">
          {item.description && (
            <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {/* Precio */}
        <div className="text-emerald-600 font-bold text-sm mt-auto pt-1">
          ${item.price.toFixed(2)}
        </div>

        {/* Botón */}
        <button
          disabled={preview}
          onClick={onAction}
          className={`mt-2 text-xs py-2 rounded-lg font-semibold ${preview
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-emerald-600 text-white"
            }`}
        >
          {item.type === "SERVICE"
            ? "Reservar"
            : "Añadir al carrito"}
        </button>
      </div>
    </div>
  );
}
