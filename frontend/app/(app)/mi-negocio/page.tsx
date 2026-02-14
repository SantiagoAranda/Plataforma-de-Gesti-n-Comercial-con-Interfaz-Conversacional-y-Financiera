"use client";

import { useState } from "react";

type ItemType = "PRODUCT" | "SERVICE";

type SentItem = {
  name: string;
  price: string;
  description: string;
  image?: string;
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

export default function MiNegocioPage() {
  const [type, setType] = useState<ItemType>("PRODUCT");
  const [isOpen, setIsOpen] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);

  const [week, setWeek] = useState<WeeklySchedule[]>(INITIAL_WEEK);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  const [sentItem, setSentItem] = useState<SentItem | null>(null);

  const handleAddImage = (file: File | null) => {
    if (!file) return;
    setImage(URL.createObjectURL(file));
  };

  const handleSend = () => {
    if (!name || !price) return;

    setSentItem({
      name,
      price,
      description,
      image: image || undefined,
    });

    setName("");
    setPrice("");
    setDescription("");
    setImage(null);
    setIsOpen(false);
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

      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-neutral-200">
        <button className="text-xl">←</button>
        <h1 className="font-medium">Crear Item</h1>
        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-sm">
          N
        </div>
      </header>

      {/* Preview */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {sentItem && (
          <div className="ml-auto max-w-[85%] bg-green-100 rounded-3xl p-3 space-y-2">
            {sentItem.image && (
              <img
                src={sentItem.image}
                alt="Preview"
                className="w-full h-56 object-cover rounded-2xl"
              />
            )}
            <div className="flex justify-between items-center">
              <p className="font-medium text-sm">{sentItem.name}</p>
              <p className="font-semibold text-green-700 text-sm">
                ${sentItem.price}
              </p>
            </div>
            {sentItem.description && (
              <p className="text-xs text-neutral-600 leading-snug">
                {sentItem.description}
              </p>
            )}
          </div>
        )}
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
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                  type === "PRODUCT"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-neutral-500"
                }`}
              >
                Producto
              </button>
              <button
                onClick={() => setType("SERVICE")}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                  type === "SERVICE"
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
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        d.active
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
