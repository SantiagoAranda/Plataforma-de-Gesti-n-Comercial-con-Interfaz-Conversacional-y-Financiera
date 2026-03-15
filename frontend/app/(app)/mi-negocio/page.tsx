"use client";

import { useState, useEffect } from "react";
import { Archive, ArchiveRestore, Plus, X, Eye } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";

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
  status: "ACTIVE" | "INACTIVE";
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

function createInitialWeek(): WeeklySchedule[] {
  return INITIAL_WEEK.map((day) => ({
    ...day,
    ranges: day.ranges.map((range) => ({ ...range })),
  }));
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);

  return aS < bE && bS < aE;
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

  const [week, setWeek] = useState<WeeklySchedule[]>(createInitialWeek);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewArchived, setViewArchived] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await api<Item[]>(`/items?status=${viewArchived ? 'INACTIVE' : 'ACTIVE'}`);
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [viewArchived]);

  const handleAddImage = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setEditingItem(null);
    setName("");
    setPrice("");
    setDescription("");
    setImage(null);
    setDuration(30);
    setWeek(createInitialWeek());
    setType("PRODUCT");
    setIsOpen(false);
  };

  const handleSend = async () => {

    if (!name || !price) return;

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

    try {

      let savedItem: Item;

      if (editingItem) {

        savedItem = await api<Item>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setItems((prev) =>
          prev.map((i) => (i.id === editingItem.id ? savedItem : i))
        );

      } else {

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

  const handleStartEdit = (item: Item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price));
    setDescription(item.description ?? "");
    setImage(item.images?.[0]?.url ?? null);
    setType(item.type);
    setDuration(item.durationMinutes ?? 30);
    const nextWeek = createInitialWeek();

    if (item.type === "SERVICE" && item.schedule?.length) {
      nextWeek.forEach((day) => {
        day.active = false;
        day.ranges = [];
      });

      item.schedule.forEach((slot) => {
        const dayIndex = WEEKDAY_ENUM.indexOf(slot.weekday);
        if (dayIndex === -1) return;

        nextWeek[dayIndex].active = true;
        nextWeek[dayIndex].ranges.push({
          start: minutesToTime(slot.startMinute),
          end: minutesToTime(slot.endMinute),
        });
      });

      nextWeek.forEach((day) => {
        if (day.ranges.length > 0) {
          day.ranges = day.ranges.slice(-2);
        }
        if (day.ranges.length === 0) {
          day.active = false;
        }
      });
    } else if (item.type === "SERVICE") {
      nextWeek.forEach((day, index) => {
        day.active = index === 0;
        day.ranges = index === 0 ? [{ start: "08:00", end: "12:00" }] : [];
      });
    } else {
      nextWeek.forEach((day) => {
        day.active = false;
        day.ranges = [];
      });
    }

    setWeek(nextWeek);
    setCurrentDayIndex(0);
    setIsOpen(true);
    setSelectedItem(null);
  };

  const handleToggleArchive = async (item: Item) => {
    try {
      const newStatus = item.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
      await api(`/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItem(null);
      setToast({
        message: newStatus === 'INACTIVE' ? "Producto archivado" : "Producto desarchivado",
        type: "success",
      });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al cambiar estado", type: "error" });
    }
    setTimeout(() => setToast(null), 2500);
  };

  const handleStatusUpdate = async (item: Item, newStatus: "ACTIVE" | "INACTIVE") => {
    try {
      await api(`/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItem(null);
      setToast({
        message: newStatus === 'INACTIVE' ? "Producto inhabilitado" : "Producto habilitado",
        type: "success",
      });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al actualizar estado", type: "error" });
    }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100">

      {selectedItem ? (
        <SelectionActionBar
          visible
          title="Item seleccionado"
          onClose={() => setSelectedItem(null)}
          onEdit={() => handleStartEdit(selectedItem)}
          onDelete={() => handleToggleArchive(selectedItem)}
          deleteLabel={viewArchived ? "Desarchivar" : "Archivar"}
          deleteIcon={viewArchived ? ArchiveRestore : Archive}
        />
      ) : (
        <AppHeader 
          title={viewArchived ? "Archivados" : "Mi negocio"} 
          showBack={true} 
          onBack={viewArchived ? () => setViewArchived(false) : undefined}
          hrefBack="/home"
          rightIcon={viewArchived ? <ArchiveRestore size={20} /> : <Archive size={20} />}
          rightAriaLabel={viewArchived ? "Ver activos" : "Ver archivados"}
          onRightClick={() => setViewArchived(!viewArchived)}
        />
      )}

      {/* LISTA DE ITEMS */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">

        {loading && <div className="text-center py-10 text-neutral-500">Cargando...</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-10 text-neutral-400">
            {viewArchived ? "No hay items archivados" : "No hay items creados"}
          </div>
        )}

        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            selected={selectedItem?.id === item.id}
            onSelect={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
            onOpen={() => handleStartEdit(item)}
          />
        ))}

      </main>
      {/* PANEL INFERIOR */}
      <div className="fixed bottom-0 left-0 right-0 z-20">

        {!isOpen && (
          <div className="bg-white border-t border-neutral-200 px-4 py-3 flex items-center gap-3 shadow-md">

            <button
              onClick={() => {
                resetForm();
                setType("PRODUCT"); // extra: siempre inicia en producto
                setIsOpen(true);
              }}
              className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl shadow-lg"
            >
              +
            </button>

            <div className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm text-neutral-500">
              Crear nuevo item...
            </div>

          </div>
        )}

        {isOpen && (
          <div className="bg-white rounded-t-3xl border-t border-neutral-200 px-4 pt-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] max-h-[85vh] overflow-y-auto space-y-6">
            
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                {editingItem ? "Editar item" : "Nuevo item"}
              </h2>
              <button 
                onClick={resetForm}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* TOGGLE PRODUCTO / SERVICIO */}
            <div className="flex bg-neutral-100 rounded-full p-1">

              <button
                disabled={!!editingItem}
                onClick={() => setType("PRODUCT")}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                  type === "PRODUCT"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-neutral-500"
                } ${editingItem ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Producto
              </button>

              <button
                disabled={!!editingItem}
                onClick={() => setType("SERVICE")}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                  type === "SERVICE"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-neutral-500"
                } ${editingItem ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Servicio
              </button>

            </div>


            {/* FOTO */}
            <div>

              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
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
            <div>

              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
                Nombre
              </label>

              <input
                placeholder="Nombre del servicio"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-100 rounded-xl px-4 py-3 text-sm outline-none"
              />

            </div>


            {/* PRECIO + DURACION */}
            <div className={`grid gap-4 ${type === "SERVICE" ? "grid-cols-2" : "grid-cols-1"}`}>

              {/* PRECIO */}
              <div>

                <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
                  Precio
                </label>

                <div className="flex items-center bg-neutral-100 rounded-xl px-4 h-[44px]">

                  <span className="text-neutral-500 text-sm mr-2">
                    $
                  </span>

                  <input
                    type="number"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-sm"
                  />

                </div>

              </div>


              {/* DURACION */}
              {type === "SERVICE" && (
                <div>

                  <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
                    Duración
                  </label>

                  <div className="relative">

                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full bg-neutral-100 rounded-xl pl-3 pr-10 py-3 text-sm outline-none"
                    />

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
                      min
                    </span>

                  </div>

                </div>
              )}

            </div>


            {/* HORARIOS */}
            {type === "SERVICE" && (
              <div>

                <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
                  Horarios disponibles
                </label>

                {/* DIAS */}
                <div className="flex justify-between gap-1 mb-3">

                  {week.map((day, i) => (

                    <button
                      key={day.day}
                      onClick={() => {

                        const copy = week.map(d => ({ ...d, ranges: [...d.ranges] }));

                        copy[i].active = !copy[i].active;

                        if (copy[i].active && copy[i].ranges.length === 0) {
                          copy[i].ranges = [{ start: "08:00", end: "12:00" }];
                        }

                        if (!copy[i].active) {
                          copy[i].ranges = [];
                        }

                        setWeek(copy);

                      }}
                      className={`flex-1 h-8 rounded-full text-[11px] font-semibold transition
                      ${
                        day.active
                          ? "bg-green-600 text-white"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {day.day.slice(0, 2).toUpperCase()}
                    </button>

                  ))}

                </div>


                {/* HEADER DIA */}
                <div className="flex items-center justify-between mb-2">

                  <button
                    onClick={() =>
                      setCurrentDayIndex(
                        currentDayIndex === 0 ? 6 : currentDayIndex - 1
                      )
                    }
                    className="text-neutral-400 text-lg"
                  >
                    ‹
                  </button>

                  <p className="text-sm font-semibold text-neutral-700">
                    {week[currentDayIndex].day}
                  </p>

                  <button
                    onClick={() =>
                      setCurrentDayIndex(
                        currentDayIndex === 6 ? 0 : currentDayIndex + 1
                      )
                    }
                    className="text-neutral-400 text-lg"
                  >
                    ›
                  </button>

                </div>


                {/* RANGOS */}
                <div className="bg-neutral-50 border border-neutral-100 rounded-2xl p-4 space-y-3 shadow-sm">

                  {week[currentDayIndex].active &&
                    week[currentDayIndex].ranges.map((range, rIndex) => (

                      <div
                        key={rIndex}
                        className="flex items-center gap-3"
                      >

                        <input
                          type="time"
                          value={range.start}
                          onChange={(e) => {

                            const copy = [...week];
                            const newStart = e.target.value;
                            const currentRange = copy[currentDayIndex].ranges[rIndex];

                            const overlap = copy[currentDayIndex].ranges.some((r, i) => {
                              if (i === rIndex) return false;
                              return rangesOverlap(newStart, currentRange.end, r.start, r.end);
                            });

                            if (!overlap) {
                              copy[currentDayIndex].ranges[rIndex].start = newStart;
                              setWeek(copy);
                            }

                          }}
                          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm h-10 flex-1"
                        />

                        <span className="text-neutral-300 text-sm">—</span>

                        <input
                          type="time"
                          value={range.end}
                          onChange={(e) => {

                            const copy = [...week];
                            const newEnd = e.target.value;
                            const currentRange = copy[currentDayIndex].ranges[rIndex];

                            const overlap = copy[currentDayIndex].ranges.some((r, i) => {
                              if (i === rIndex) return false;
                              return rangesOverlap(currentRange.start, newEnd, r.start, r.end);
                            });

                            if (!overlap) {
                              copy[currentDayIndex].ranges[rIndex].end = newEnd;
                              setWeek(copy);
                            }

                          }}
                          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm h-10 flex-1"
                        />

                        <button
                          onClick={() => {
                            const copy = [...week];
                            copy[currentDayIndex].ranges.splice(rIndex, 1);
                            setWeek(copy);
                          }}
                          className="ml-auto text-neutral-400 hover:text-red-500 transition"
                        >
                          ✕
                        </button>

                      </div>

                    ))}

                  {week[currentDayIndex].active &&
                    week[currentDayIndex].ranges.length < 2 && (

                      <button
                        onClick={() => {

                          const copy = [...week];
                          const ranges = copy[currentDayIndex].ranges;

                          if (ranges.length === 0) {
                            ranges.push({ start: "08:00", end: "12:00" });
                          } else if (ranges.length === 1) {
                            ranges.push({ start: "14:00", end: "18:00" });
                          }

                          setWeek(copy);

                        }}
                        className="text-green-600 text-xs font-semibold mt-2"
                      >
                        + Agregar horario
                      </button>

                    )}

                </div>

              </div>
            )}


            {/* DESCRIPCION */}
            <div>

              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2 block">
                Descripción
              </label>

              <div className="flex items-end gap-2">

                <textarea
                  placeholder="Detalles adicionales..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={1}
                  className="flex-1 bg-neutral-100 rounded-2xl px-4 py-3 text-sm outline-none resize-none min-h-[42px] max-h-[120px]"
                />

                <button
                  onClick={handleSend}
                  className="w-11 h-11 rounded-full bg-green-600 text-white shadow-md flex items-center justify-center active:scale-95 transition"
                >
                  ➤
                </button>

              </div>

            </div>

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
