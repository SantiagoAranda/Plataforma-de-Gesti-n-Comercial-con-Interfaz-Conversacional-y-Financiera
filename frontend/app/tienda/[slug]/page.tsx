"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";


type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  name: string;
  price: number;
  type: ItemType;
  durationMinutes?: number;
  images?: { id: string; url: string }[];
};

export default function PublicStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCartModal, setShowCartModal] = useState(false);

  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [category, setCategory] = useState<string>("");

  /* ================= FETCH ITEMS ================= */

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/items?type=${category}`
        );

        if (!res.ok) throw new Error();

        const data = await res.json();

        setItems(
          data.data.map((item: any) => ({
            ...item,
            price: Number(item.price),
          }))
        );
      } catch {
        notify({
          type: "error",
          message: "No se pudieron cargar los productos",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [slug, category]);

  /* ================= FETCH DISPONIBILIDAD ================= */

  const handleDateChange = async (date: Date) => {
    if (!selectedService) return;

    const formatted = date.toISOString().split("T")[0];

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/availability?itemId=${selectedService.id}&date=${formatted}`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();

      setAvailableSlots(data);
    } catch {
      setAvailableSlots([]);
    }
  };

  /* ================= RESERVAR ================= */

  const handleReserve = async (data: any) => {

    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las reservas están deshabilitadas",
      });
      return;
    }

    const [h, m] = data.time.split(":").map(Number);

    const startMinute = h * 60 + m;
    const endMinute = startMinute + (selectedService.durationMinutes ?? 60);

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: selectedService.id,
          customerName: data.fullName,
          customerWhatsapp: data.whatsapp,
          date: data.date,
          startMinute,
          endMinute,
        }),
      });

      notify({
        type: "success",
        message: "Reserva creada correctamente",
      });

      setSelectedService(null);
      setAvailableSlots([]);
    } catch {
      notify({
        type: "error",
        message: "No se pudo crear la reserva",
      });
    }
  };

  /* ================= CARRITO ================= */

  const addToCart = (id: string) => {

    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: las compras están deshabilitadas",
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

  /* ================= FILTRO ================= */

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  /* ================= CONFIRMAR COMPRA ================= */

  const handleConfirmOrder = async () => {

    if (preview) {
      notify({
        type: "info",
        message: "Modo administrador: no se pueden realizar pedidos",
      });
      return;
    }

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerWhatsapp: whatsapp,
          items: cartItems.map((item) => ({
            itemId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      notify({ type: "success", message: "Compra enviada" });

      setCart({});
      setShowCartModal(false);
      setCustomerName("");
      setWhatsapp("");
    } catch {
      notify({ type: "error", message: "Error al enviar pedido" });
    }
  };

  /* ================= RENDER ================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">

      {preview && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 font-medium">
          Modo administrador — vista previa de la tienda
        </div>
      )}
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">

        {/* Buscador */}
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
          <Search className="h-5 w-5 text-black/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {/* Filtros */}
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

        {/* Grid */}
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

      {/* FAB carrito */}
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

      {/* MODAL CARRITO */}
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

              <input
                placeholder="WhatsApp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full border rounded-xl px-4 py-3"
              />
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

      {/* Drawer reservas */}
      <ReservationDrawer
        open={!!selectedService}
        onClose={() => setSelectedService(null)}
        title={selectedService?.name}
        subtitle="Selecciona día y horario disponible"
        timeSlots={availableSlots}
        onDateChange={handleDateChange}
        onConfirm={handleReserve}
      />
    </div>
  );
}

/* ================= CARD ================= */

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
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:-translate-y-1">
      <div className="aspect-square bg-gray-100 overflow-hidden rounded-t-xl">
        {item.images?.[0]?.url && (
          <img
            src={item.images[0].url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold line-clamp-2">
          {item.name}
        </div>

        <div className="text-emerald-600 font-bold text-sm">
          ${item.price.toFixed(2)}
        </div>

        <button
          disabled={preview}
          onClick={onAction}
          className={`mt-auto text-xs py-2 rounded-lg font-semibold ${preview
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
