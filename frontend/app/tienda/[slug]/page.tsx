"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [showCartModal, setShowCartModal] = useState(false);

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  const [category, setCategory] = useState<string>("");

  const [customerName, setCustomerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  /* ================= FETCH ITEMS ================= */

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/items?type=${category}`
        );

        if (!res.ok) throw new Error("Failed to fetch products");

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

  /* ================= AVAILABILITY ================= */

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
    if (!selectedService) return;

    const [h, m] = data.time.split(":").map(Number);
    const startMinute = h * 60 + m;
    const endMinute =
      startMinute + (selectedService.durationMinutes ?? 60);

    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/reserve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: selectedService.id,
            date: data.date,
            startMinute,
            endMinute,
            customerName: data.fullName,
            customerWhatsapp: data.whatsapp,
          }),
        }
      );

      notify({
        type: "success",
        message: "Reserva creada correctamente",
      });

      setSelectedService(null);
      setAvailableSlots([]);
    } catch {
      notify({
        type: "error",
        message: "Error al crear la reserva",
      });
    }
  };

  /* ================= FILTRO ================= */

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  /* ================= CARRITO ================= */

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    notify({
      type: "success",
      message: "Producto agregado al carrito",
    });
  };

  const cartCount = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart]
  );

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((acc, [itemId, quantity]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return acc;
      return acc + item.price * quantity;
    }, 0);
  }, [cart, items]);

  /* ================= RENDER ================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
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
          <button
            onClick={() => setCategory("")}
            className={`${!category ? "bg-emerald-600 text-white" : "bg-white text-black"} p-2 rounded-full`}
          >
            Todo
          </button>
          <button
            onClick={() => setCategory("PRODUCT")}
            className={`${category === "PRODUCT" ? "bg-emerald-600 text-white" : "bg-white text-black"} p-2 rounded-full`}
          >
            Productos
          </button>
          <button
            onClick={() => setCategory("SERVICE")}
            className={`${category === "SERVICE" ? "bg-emerald-600 text-white" : "bg-white text-black"} p-2 rounded-full`}
          >
            Servicios
          </button>
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
                onAction={() => {
                  if (item.type === "SERVICE") {
                    setSelectedService(item);
                  } else {
                    addToCart(item.id);
                  }
                }}
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

      {/* Drawer reservas */}
      <ReservationDrawer
        open={!!selectedService}
        onClose={() => {
          setSelectedService(null);
          setAvailableSlots([]);
        }}
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
}: {
  item: Item;
  onAction: () => void;
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
          onClick={onAction}
          className="mt-auto bg-emerald-600 text-white text-xs py-2 rounded-lg font-semibold"
        >
          {item.type === "SERVICE"
            ? "Reservar"
            : "Añadir al carrito"}
        </button>
      </div>
    </div>
  );
}