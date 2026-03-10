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

  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  /* ================= FETCH ITEMS ================= */

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/items`
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
  }, [slug]);

  /* ================= FILTRO ================= */

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  /* ================= DISPONIBILIDAD ================= */

  const fetchAvailability = async (date: Date) => {
    if (!selectedService) return;

    try {
      const formatted = date.toISOString().split("T")[0];

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/availability?itemId=${selectedService.id}&date=${formatted}`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();
      setAvailableSlots(data);
    } catch {
      notify({
        type: "error",
        message: "No se pudo obtener disponibilidad",
      });
    }
  };

  /* ================= RESERVA ================= */

  const handleConfirmReservation = async (data: any) => {
    if (!selectedService || !data.date || !data.time) return;

    try {
      const start = new Date(data.date);
      const [hour, minute] = data.time.split(":").map(Number);

      start.setHours(hour);
      start.setMinutes(minute);

      const duration = selectedService.durationMinutes || 60;

      const end = new Date(start);
      end.setMinutes(start.getMinutes() + duration);

      const startMinute = start.getHours() * 60 + start.getMinutes();
      const endMinute = end.getHours() * 60 + end.getMinutes();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/public/${slug}/reserve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: selectedService.id,
            customerName: data.fullName,
            customerWhatsapp: data.whatsapp,
            date: data.date,
            startMinute,
            endMinute,
          }),
        }
      );

      if (!res.ok) throw new Error();

      notify({
        type: "success",
        message: "Reserva creada correctamente",
      });

      setSelectedService(null);
      setAvailableSlots([]);
      setSelectedDate(null);
    } catch {
      notify({
        type: "error",
        message: "No se pudo crear la reserva",
      });
    }
  };

  /* ================= RENDER ================= */

  return (
    <div className="min-h-dvh bg-[#F7FAF8]">
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
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

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
        onDateChange={(date) => {
          setSelectedDate(date);
          fetchAvailability(date);
        }}
        onConfirm={handleConfirmReservation}
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
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-black/5">
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
        <div className="text-sm font-semibold">{item.name}</div>
        <div className="text-emerald-600 font-bold text-sm">
          ${item.price.toFixed(2)}
        </div>

        <button
          onClick={onAction}
          className="mt-auto bg-emerald-600 text-white text-xs py-2 rounded-lg font-semibold"
        >
          Reservar
        </button>
      </div>
    </div>
  );
}
