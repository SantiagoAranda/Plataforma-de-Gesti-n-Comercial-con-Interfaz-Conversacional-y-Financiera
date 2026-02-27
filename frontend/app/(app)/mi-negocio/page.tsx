"use client";

import { useState, useEffect } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";

type ItemType = "PRODUCT" | "SERVICE";

type Item = {
  id: string;
  type: ItemType;
  name: string;
  price: number;
  description?: string;
  durationMinutes?: number;
  images?: { id: string; url: string; order: number }[];
};

type TimeRange = {
  start: string;
  end: string;
};

type WeeklySchedule = {
  day: string;
  active: boolean;
  ranges: TimeRange[];
};

const INITIAL_WEEK: WeeklySchedule[] = [
  { day: "Lunes", active: true, ranges: [{ start: "08:00", end: "12:00" }] },
  { day: "Martes", active: false, ranges: [] },
  { day: "Miércoles", active: false, ranges: [] },
  { day: "Jueves", active: false, ranges: [] },
  { day: "Viernes", active: false, ranges: [] },
  { day: "Sábado", active: false, ranges: [] },
  { day: "Domingo", active: false, ranges: [] },
];

const WEEKDAY_ENUM = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default function MiNegocioPage() {
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [isOpen, setIsOpen] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [week, setWeek] = useState<WeeklySchedule[]>(INITIAL_WEEK);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // 🔥 Traer items reales
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const data = await api<Item[]>("/items");
        setItems(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchItems();
  }, []);

  useEffect(() => {
  const handleClickOutside = () => {
    setOpenMenuId(null);
  };

  window.addEventListener("click", handleClickOutside);

  return () => {
    window.removeEventListener("click", handleClickOutside);
  };
}, []);

  const handleAddImage = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setImage(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!name || !price) return;

    try {
      let schedule: any[] = [];

      if (type === "SERVICE") {
        schedule = week
          .map((d, index) => ({ ...d, index }))
          .filter((d) => d.active && d.ranges.length > 0)
          .flatMap((d) =>
            d.ranges.map((r) => ({
              weekday: WEEKDAY_ENUM[d.index],
              startMinute: timeToMinutes(r.start),
              endMinute: timeToMinutes(r.end),
            }))
          );
      }

      const payload = {
        type,
        name,
        price: Number(price),
        description: description || undefined,
        durationMinutes:
          type === "SERVICE" ? Number(duration) : undefined,
        schedule: type === "SERVICE" ? schedule : undefined,
      };

      console.log("PAYLOAD FINAL:", payload);

      const createdItem = await api<any>("/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (image) {
        await api(`/items/${createdItem.id}/images`, {
          method: "POST",
          body: JSON.stringify({ url: image }),
        });
      }

      const updatedItem = await api<any>(`/items/${createdItem.id}`);
      setItems((prev) => [updatedItem, ...prev]);

      // reset
      setName("");
      setPrice("");
      setDescription("");
      setImage(null);
      setWeek(INITIAL_WEEK);
      setIsOpen(false);

    } catch (err) {
      console.error("ERROR BACKEND:", err);
    }
  };

  const handleDelete = async (id: string) => {
  const confirmDelete = confirm("¿Eliminar este producto?");
  if (!confirmDelete) return;

  try {
    await api(`/items/${id}`, {
      method: "DELETE",
    });

    setItems((prev) => prev.filter((item) => item.id !== id));
    setOpenMenuId(null);
  } catch (err) {
    console.error(err);
  }
};

  const toggleDay = (index: number) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i === index ? { ...d, active: !d.active } : d
      )
    );
  };

  const addRange = () => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i === currentDayIndex && d.ranges.length < 2
          ? {
            ...d,
            ranges: [...d.ranges, { start: "14:00", end: "18:00" }],
          }
          : d
      )
    );
  };

  const updateRange = (
    rangeIndex: number,
    field: "start" | "end",
    value: string
  ) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i === currentDayIndex
          ? {
            ...d,
            ranges: d.ranges.map((r, ri) =>
              ri === rangeIndex ? { ...r, [field]: value } : r
            ),
          }
          : d
      )
    );
  };

  const removeRange = (rangeIndex: number) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i === currentDayIndex
          ? {
            ...d,
            ranges: d.ranges.filter((_, ri) => ri !== rangeIndex),
          }
          : d
      )
    );
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100">
      <AppHeader title="Mi negocio" showBack />

      {/* CHAT REAL */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {loadingItems && (
          <p className="text-center text-neutral-400 text-sm">
            Cargando productos...
          </p>
        )}

        {items.map((item) => (
  <div
    key={item.id}
    className="relative ml-auto max-w-[78%] bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden"
  >
    {/* Botón tres puntos */}
    <div className="absolute top-2 right-2 z-10">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(openMenuId === item.id ? null : item.id);
        }}
        className="w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-neutral-600 hover:bg-neutral-100 text-sm shadow-sm"
      >
        ⋯
      </button>

      {openMenuId === item.id && (
        <div className="absolute right-0 mt-2 w-32 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50"
            onClick={() => {
              console.log("Editar", item.id);
              setOpenMenuId(null);
            }}
          >
            Editar
          </button>

          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-neutral-50"
            onClick={() => {
              handleDelete(item.id);
            }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>

    {/* Imagen */}
    {item.images && item.images.length > 0 && (
      <div className="bg-neutral-50 flex items-center justify-center">
        <img
          src={item.images[0].url}
          alt={item.name}
          className="w-full max-h-60 object-contain"
        />
      </div>
    )}

    <div className="px-4 py-3 space-y-2">
      {/* Título + Precio */}
      <div className="flex justify-between items-start">
        <p className="text-sm font-semibold text-neutral-900">
          {item.name}
        </p>

        <p className="text-emerald-600 font-semibold text-sm">
          ${item.price}
        </p>
      </div>

      {/* Duración */}
      {item.type === "SERVICE" && (
        <div className="flex items-center gap-2 text-neutral-500 text-xs">
          <span>🕒</span>
          <span>{item.durationMinutes} min</span>
        </div>
      )}

      {/* Descripción */}
      {item.description && (
        <p className="text-xs text-neutral-500 leading-relaxed">
          {item.description}
        </p>
      )}

      {/* Hora */}
      <div className="flex justify-end">
        <span className="text-[11px] text-neutral-400">
          {new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  </div>
))}
      </main>

      {/* Panel inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-20">

        {/* Estado cerrado */}
        {!isOpen && (
          <div className="bg-white border-t border-neutral-200 px-4 py-3 flex items-center gap-3 shadow-md">
            <button
              onClick={() => setIsOpen(true)}
              className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl shadow-lg transition active:scale-95"
            >
              +
            </button>

            <div className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm text-neutral-500">
              Crear nuevo item...
            </div>
          </div>
        )}

        {/* Estado abierto */}
        {isOpen && (
          <div className="bg-white rounded-t-3xl border-t border-neutral-200 px-4 pt-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] max-h-[85vh] overflow-y-auto">

            {/* Header del form */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-neutral-700">
                Nuevo {type === "PRODUCT" ? "Producto" : "Servicio"}
              </h2>

              <button
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-lg hover:bg-neutral-200 transition"
              >
                ✕
              </button>
            </div>

            {/* Toggle */}
            <div className="flex bg-neutral-100 rounded-full p-1 mb-4">
              <button
                onClick={() => setType("PRODUCT")}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "PRODUCT"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-neutral-500"
                  }`}
              >
                Producto
              </button>
              <button
                onClick={() => setType("SERVICE")}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${type === "SERVICE"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-neutral-500"
                  }`}
              >
                Servicio
              </button>
            </div>

            {/* Fotos */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-600 mb-2">
                Fotos
              </label>
              <div className="flex gap-3">
                <label className="w-20 h-20 border-2 border-dashed border-green-500 rounded-2xl flex items-center justify-center cursor-pointer text-green-600 text-xl">
                  +
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleAddImage(e.target.files?.[0] || null)
                    }
                  />
                </label>
                {image && (
                  <img
                    src={image}
                    alt="preview"
                    className="w-20 h-20 object-cover rounded-2xl"
                  />
                )}
              </div>
            </div>

            {/* Nombre */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Nombre {type === "PRODUCT" ? "del producto" : "del servicio"}
              </label>
              <input
                placeholder="Ej: Camiseta"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Precio + Duración */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Precio
                </label>
                <input
                  type="number"
                  placeholder="$ 0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {type === "SERVICE" && (
                <div className="w-32">
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Duración
                  </label>
                  <div className="flex items-center bg-neutral-100 rounded-xl px-4 py-3 text-sm">
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full outline-none bg-transparent"
                    />
                    <span className="text-neutral-500 ml-2">min</span>
                  </div>
                </div>
              )}
            </div>

            {/* Horarios */}
            {type === "SERVICE" && (
              <div className="mb-4 space-y-4">
                <label className="block text-xs font-medium text-neutral-600">
                  Horarios disponibles
                </label>

                <div className="flex justify-between gap-1">
                  {week.map((d, i) => (
                    <button
                      key={d.day}
                      onClick={() => toggleDay(i)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${d.active
                          ? "bg-green-600 text-white shadow-md scale-105"
                          : "bg-neutral-100 text-neutral-400"
                        }`}
                    >
                      {d.day.slice(0, 2).toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-4 bg-neutral-50 rounded-2xl px-4 py-3">
                  <button
                    onClick={() =>
                      setCurrentDayIndex((prev) =>
                        prev === 0 ? week.length - 1 : prev - 1
                      )
                    }
                    className="text-neutral-500 text-lg"
                  >
                    ‹
                  </button>

                  <p className="font-semibold text-sm tracking-wide">
                    {week[currentDayIndex].day}
                  </p>

                  <button
                    onClick={() =>
                      setCurrentDayIndex((prev) =>
                        prev === week.length - 1 ? 0 : prev + 1
                      )
                    }
                    className="text-neutral-500 text-lg"
                  >
                    ›
                  </button>
                </div>

                {week[currentDayIndex].active && (
                  <div className="space-y-3 bg-neutral-50 rounded-2xl p-4">
                    {week[currentDayIndex].ranges.map((r, ri) => (
                      <div key={ri} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={r.start}
                          onChange={(e) =>
                            updateRange(ri, "start", e.target.value)
                          }
                          className="bg-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        />
                        <span className="text-neutral-400">—</span>
                        <input
                          type="time"
                          value={r.end}
                          onChange={(e) =>
                            updateRange(ri, "end", e.target.value)
                          }
                          className="bg-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        />
                        <button
                          onClick={() => removeRange(ri)}
                          className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center"
                        >
                          🗑
                        </button>
                      </div>
                    ))}

                    {week[currentDayIndex].ranges.length < 2 && (
                      <button
                        onClick={addRange}
                        className="text-xs font-medium text-green-600 hover:underline"
                      >
                        + Agregar segundo turno
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Descripción + Enviar */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Descripción (opcional)
              </label>

              <div className="flex items-end gap-3">
                <textarea
                  placeholder="Detalles adicionales..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex-1 bg-neutral-100 rounded-2xl px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-green-500 outline-none"
                  rows={1}
                />

                <button
                  onClick={handleSend}
                  disabled={!name || !price}
                  className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  ➤
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}