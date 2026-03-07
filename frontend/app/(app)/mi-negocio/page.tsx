"use client";

import { useState, useEffect } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";

type ItemType = "PRODUCT" | "SERVICE";

type Schedule = {
  weekday: string;
  startMinute: number;
  endMinute: number;
};

type Item = {
  id: string;
  type: ItemType;
  name: string;
  price: number;
  description?: string;
  durationMinutes?: number;
  schedule?: Schedule[];
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

const WEEKDAY_ENUM = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number) {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");

  const m = (min % 60).toString().padStart(2, "0");

  return `${h}:${m}`;
}

export default function MiNegocioPage() {

  const [type, setType] = useState<ItemType>("PRODUCT");
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);

  const [week, setWeek] = useState<WeeklySchedule[]>(INITIAL_WEEK);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
  message: string;
  type: "success" | "error";
} | null>(null);
const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const handleEdit = (item: Item) => {

    setEditingItem(item);

    setType(item.type);
    setName(item.name);
    setPrice(String(item.price));
    setDescription(item.description || "");
    setDuration(item.durationMinutes || 30);

    if (item.images && item.images.length > 0) {
      setImage(item.images[0].url);
    }

    if (item.type === "SERVICE") {

      const schedules = item.schedule ?? [];

      const newWeek: WeeklySchedule[] = INITIAL_WEEK.map((d) => ({
        ...d,
        active: false,
        ranges: [],
      }));

      schedules.forEach((s) => {

        const index = WEEKDAY_ENUM.indexOf(s.weekday);

        if (index !== -1) {

          newWeek[index].active = true;

          newWeek[index].ranges.push({
            start: minutesToTime(s.startMinute),
            end: minutesToTime(s.endMinute),
          });

        }
      });

      setWeek(newWeek);
    }

    setIsOpen(true);
    setOpenMenuId(null);
  };

  const resetForm = () => {
    setEditingItem(null);
    setName("");
    setPrice("");
    setDescription("");
    setImage(null);
    setDuration(30);
    setWeek(INITIAL_WEEK);
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
        durationMinutes: type === "SERVICE" ? Number(duration) : undefined,
        schedule: type === "SERVICE" ? schedule : undefined,
      };

      let savedItem: Item;

      if (editingItem) {

        savedItem = await api<Item>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? savedItem : i))
        );
      }

      else {

        const createdItem = await api<Item>("/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (image) {

          await api(`/items/${createdItem.id}/images`, {
            method: "POST",
            body: JSON.stringify({ url: image }),
          });

        }

        savedItem = await api<Item>(`/items/${createdItem.id}`);
        setItems((prev) => [savedItem, ...prev]);
      }

      resetForm();
      setIsOpen(false);

    } catch (err) {
      console.error(err);
    }
  };


    return (
    <div className="flex flex-col h-screen bg-neutral-100">
      <AppHeader title="Mi negocio" showBack />

      {/* LISTA DE ITEMS */}
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

            {/* MENU */}
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
                    onClick={() => handleEdit(item)}
                  >
                    Editar
                  </button>

                  <button
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-neutral-50"
                    onClick={() => setDeleteId(item.id)}
                  >
                    Archivar
                  </button>

                </div>
              )}

            </div>

            {/* IMAGEN */}
            {item.images && item.images.length > 0 && (
              <div className="bg-neutral-50 flex items-center justify-center">
                <img
                  src={item.images[0].url}
                  alt={item.name}
                  className="w-full max-h-60 object-contain"
                />
              </div>
            )}

            {/* CONTENIDO */}
            <div className="px-4 py-3 space-y-2">

              <div className="flex justify-between items-start">

                <p className="text-sm font-semibold text-neutral-900">
                  {item.name}
                </p>

                <p className="text-emerald-600 font-semibold text-sm">
                  ${item.price}
                </p>

              </div>

              {item.type === "SERVICE" && (
                <div className="flex items-center gap-2 text-neutral-500 text-xs">
                  <span>🕒</span>
                  <span>{item.durationMinutes} min</span>
                </div>
              )}

              {item.description && (
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {item.description}
                </p>
              )}

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

      {/* PANEL INFERIOR */}
      <div className="fixed bottom-0 left-0 right-0 z-20">

        {!isOpen && (
          <div className="bg-white border-t border-neutral-200 px-4 py-3 flex items-center gap-3 shadow-md">

            <button
              onClick={() => {
                resetForm();
                setIsOpen(true);
              }}
              className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl shadow-lg transition active:scale-95"
            >
              +
            </button>

            <div className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm text-neutral-500">
              Crear nuevo item...
            </div>

          </div>
        )}

        {isOpen && (
          <div className="bg-white rounded-t-3xl border-t border-neutral-200 px-4 pt-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] max-h-[85vh] overflow-y-auto">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-4">

              <h2 className="text-sm font-semibold text-neutral-700">
                {editingItem
                  ? "Editar item"
                  : `Nuevo ${type === "PRODUCT" ? "Producto" : "Servicio"}`}
              </h2>

              <button
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
                className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-lg hover:bg-neutral-200"
              >
                ✕
              </button>

            </div>

            {/* TOGGLE PRODUCTO / SERVICIO */}
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

            {/* FOTO */}
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

            {/* NOMBRE */}
            <input
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none mb-3"
            />

            {/* PRECIO */}
            <input
              type="number"
              placeholder="Precio"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none mb-3"
            />

            {/* DURACION SERVICIO */}
            {type === "SERVICE" && (
              <div className="flex items-center bg-neutral-100 rounded-xl px-4 py-3 text-sm mb-3">

                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full outline-none bg-transparent"
                />

                <span className="text-neutral-500 ml-2">min</span>

              </div>
            )}

            {/* DESCRIPCION */}
            <textarea
              placeholder="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none mb-4"
            />

            {/* BOTON */}
            <button
              onClick={handleSend}
              className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:brightness-95"
            >
              {editingItem ? "Guardar cambios" : "Crear item"}
            </button>

          </div>
        )}

      </div>

      {/* MODAL ARCHIVAR */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

          <div className="bg-white rounded-2xl p-6 w-[90%] max-w-xs shadow-lg">

            <h3 className="text-base font-semibold text-neutral-900 mb-2">
              Archivar producto
            </h3>

            <p className="text-sm text-neutral-500 mb-5">
              Este producto dejará de aparecer en la tienda.
            </p>

            <div className="flex justify-end gap-3">

              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm rounded-lg bg-neutral-100 hover:bg-neutral-200"
              >
                Cancelar
              </button>

              <button
                onClick={async () => {

                  if (!deleteId) return;

                  try {

                    await api(`/items/${deleteId}`, {
                      method: "DELETE",
                    });

                    setItems((prev) =>
                      prev.filter((item) => item.id !== deleteId)
                    );
                    setOpenMenuId(null);

                    setToast({
                      message: "Producto archivado",
                      type: "success",
                    });

                  } catch (err) {

                    console.error(err);

                    setToast({
                      message: "No se pudo archivar el producto",
                      type: "error",
                    });

                  }

                  setDeleteId(null);

                  setTimeout(() => {
                    setToast(null);
                  }, 2500);

                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                Archivar
              </button>

            </div>

          </div>

        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-fade-in
          ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}
        >
          {toast.message}
        </div>
      )}

    </div>
  );
}