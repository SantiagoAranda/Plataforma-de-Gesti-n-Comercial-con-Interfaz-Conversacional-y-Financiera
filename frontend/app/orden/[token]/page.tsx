"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import ReservationDrawer from "@/src/components/reservations/ReservationDrawer";
import { formatLocalDateKey } from "@/src/lib/datetime";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  const { token } = useParams<{ token: string }>();
  const { notify } = useNotification();

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Item | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchItems = async () => {
      try {
        const res = await fetch(`${API_URL}/public/${token}/items`);

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
  }, [token, notify]);

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  );

  const fetchAvailability = async (date: Date) => {
    if (!selectedService || !token) return;

    try {
      const formatted = formatLocalDateKey(date);
      const res = await fetch(
        `${API_URL}/public/${token}/availability?itemId=${selectedService.id}&date=${formatted}`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();
      setAvailableSlots(Array.isArray(data) ? data : []);
    } catch {
      notify({
        type: "error",
        message: "No se pudo obtener disponibilidad",
      });
      setAvailableSlots([]);
    }
  };

  const fetchAvailabilityCalendar = async (date: Date) => {
    if (!selectedService || !token) return;

    try {
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const res = await fetch(
        `${API_URL}/public/${token}/availability-calendar?itemId=${selectedService.id}&month=${month}`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();
      setAvailableDates(Array.isArray(data) ? data : []);
    } catch {
      notify({
        type: "error",
        message: "No se pudo obtener disponibilidad del calendario",
      });
      setAvailableDates([]);
    }
  };

  const handleConfirmReservation = async (data: any) => {
    if (!selectedService || !data.date || !data.time) return;

    try {
      const [hour, minute] = data.time.split(":").map(Number);
      const duration = selectedService.durationMinutes || 60;
      const startMinute = hour * 60 + minute;
      const endMinute = startMinute + duration;

      const res = await fetch(
        `${API_URL}/public/${token}/reserve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: selectedService.id,
            customerName: data.fullName,
            customerWhatsapp: data.whatsapp,
            date: formatLocalDateKey(data.date),
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
      setAvailableDates([]);
      setSelectedDate(null);
    } catch {
      notify({
        type: "error",
        message: "No se pudo crear la reserva",
      });
    }
  };

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

      <ReservationDrawer
        open={!!selectedService}
        onClose={() => {
          setSelectedService(null);
          setAvailableSlots([]);
          setAvailableDates([]);
          setSelectedDate(null);
        }}
        title={selectedService?.name}
        subtitle="Selecciona dia y horario disponible"
        timeSlots={availableSlots}
        availableDates={availableDates}
        selectedDateValue={selectedDate ? formatLocalDateKey(selectedDate) : null}
        onDateChange={(date) => {
          setSelectedDate(date);
          fetchAvailability(date);
        }}
        onMonthChange={fetchAvailabilityCalendar}
        onConfirm={handleConfirmReservation}
      />
    </div>
  );
}

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
