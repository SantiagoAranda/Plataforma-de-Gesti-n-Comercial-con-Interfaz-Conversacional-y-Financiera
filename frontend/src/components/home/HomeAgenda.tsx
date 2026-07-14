"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Truck,
  CalendarClock,
  Lock,
  Plus,
  Search,
  X,
} from "lucide-react";

import type { Sale } from "@/src/types/sales";
import { cn } from "@/src/lib/utils";
import {
  getAgendaEventDateKeys,
  getAgendaEventsForDate,
  type AgendaEvent,
  type AgendaEventStatus,
} from "@/src/lib/agenda/events";
import { HomeAgendaDetailsDrawer } from "@/src/components/home/HomeAgendaDetails";
import DayPickerCalendar from "@/src/components/shared/DayPickerCalendar";

type HomeCategoryFilter = "TODOS" | "CLIENTES" | "PROVEEDORES" | "EVENTOS";

interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  notes?: string;
}

const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: "1",
    name: "Distribuidora San Juan",
    phone: "+54 9 264 456-7890",
    email: "ventas@sanjuan.com",
    category: "Bebidas y Alimentos",
    notes: "Entregas los martes por la mañana.",
  },
  {
    id: "2",
    name: "Insumos Comerciales S.A.",
    phone: "+54 9 11 5432-1098",
    email: "contacto@insumoscomerciales.com",
    category: "Descartables y Limpieza",
    notes: "Descuento del 10% por pago en efectivo.",
  },
  {
    id: "3",
    name: "Papelera del Norte",
    phone: "+54 9 387 654-3210",
    email: "info@papeleranorte.com.ar",
    category: "Packaging y Papelería",
    notes: "Pedido mínimo $50.000.",
  },
];

function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/* ── Full-screen placeholder for upcoming sections ── */
function FullScreenPlaceholder({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        {icon}
      </div>
      <p className="mt-5 text-[17px] font-semibold text-neutral-800">
        {title}
      </p>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-neutral-400">
        {subtitle}
      </p>
    </div>
  );
}

function getInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "-";
}

function statusBadgeStyle(status: AgendaEventStatus) {
  switch (status) {
    case "CONFIRMADO":
      return "bg-emerald-100/70 text-emerald-800";
    case "PENDIENTE":
      return "bg-amber-100/70 text-amber-800";
    case "CANCELADO":
      return "bg-red-100/70 text-red-800";
    case "COMPLETADO":
      return "bg-slate-100/70 text-slate-600";
    default:
      return "bg-slate-100/70 text-slate-600";
  }
}

function AgendaEventRow({ event }: { event: AgendaEvent }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-white border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
      {/* Left: Avatar with Initial */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[16px]">
        {getInitial(event.customerName)}
      </div>

      {/* Center & Right content */}
      <div className="flex-1 min-w-0">
        {/* Top: Name on left, Time on right */}
        <div className="flex justify-between items-baseline">
          <p className="font-medium truncate text-neutral-800 text-[15px]">
            {event.customerName}
          </p>
          <span className="text-[12px] text-neutral-400 font-normal shrink-0 ml-2 whitespace-nowrap">
            {formatTimeLabel(event.scheduledAt)}
          </span>
        </div>

        {/* Bottom: Service description on left, status badge on right */}
        <div className="flex justify-between items-center mt-0.5">
          <p className="text-sm text-neutral-400 truncate leading-snug flex-1">
            {event.description || "Servicio"}
          </p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider shrink-0 ml-2",
              statusBadgeStyle(event.status),
            )}
          >
            {event.status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HomeAgenda({
  sales,
  onOpenDetailedAgenda,
  onFilterChange,
}: {
  sales: Sale[];
  onOpenDetailedAgenda?: (date: Date) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filter, setFilter] = useState<HomeCategoryFilter>("TODOS");

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    category: "",
    notes: "",
  });

  const eventDateKeys = useMemo(() => getAgendaEventDateKeys(sales), [sales]);
  const dayEvents = useMemo(
    () => getAgendaEventsForDate(sales, selectedDate),
    [sales, selectedDate],
  );
  const pendingEventsCount = useMemo(() => {
    return dayEvents.filter(
      (ev) => ev.status !== "COMPLETADO" && ev.status !== "CANCELADO"
    ).length;
  }, [dayEvents]);

  const hasEvents = dayEvents.length > 0;
  const visibleEvents = hasEvents ? dayEvents.slice(0, 3) : [];

  /* When a non-TODOS category is active, the component expands to fill
     the entire remaining viewport height (full-screen mode). */
  const isFullScreen = filter === "CLIENTES" || filter === "PROVEEDORES";

  function scrollFilters(direction: "left" | "right") {
    filtersRef.current?.scrollBy({
      left: direction === "left" ? -140 : 140,
      behavior: "smooth",
    });
  }

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.category.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.phone.includes(supplierSearch)
    );
  }, [suppliers, supplierSearch]);

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name.trim() || !newSupplier.phone.trim()) return;

    const added: Supplier = {
      id: Date.now().toString(),
      name: newSupplier.name.trim(),
      phone: newSupplier.phone.trim(),
      email: newSupplier.email.trim(),
      category: newSupplier.category.trim() || "General",
      notes: newSupplier.notes.trim() || undefined,
    };

    setSuppliers((prev) => [added, ...prev]);
    setNewSupplier({
      name: "",
      phone: "",
      email: "",
      category: "",
      notes: "",
    });
    setIsSupplierModalOpen(false);
  };

  /* ── Content area below the filter pills ── */
  function renderCategoryContent() {
    switch (filter) {
      case "CLIENTES":
        return (
          <FullScreenPlaceholder
            icon={<Users className="h-7 w-7" />}
            title="Gestión de Clientes"
            subtitle="El directorio y la gestión integral de clientes estarán disponibles próximamente."
          />
        );

      case "PROVEEDORES":
        return (
          <div className="flex flex-col flex-1 bg-white px-4 py-4 min-h-0 relative">
            {/* Search Input */}
            <div className="relative mb-4">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Buscar proveedor..."
                className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-100 rounded-2xl text-[14px] outline-none focus:border-emerald-300 focus:bg-white transition"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto min-h-0 pb-20">
              {filteredSuppliers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400">
                  <p className="text-[14px] font-normal">No se encontraron proveedores</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSuppliers.map((sup) => (
                    <div key={sup.id} className="py-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[15px] font-medium text-neutral-800">
                          {sup.name}
                        </h4>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium whitespace-nowrap">
                          {sup.category}
                        </span>
                      </div>
                      <p className="text-[13px] text-neutral-500 font-normal">
                        {sup.phone}
                      </p>
                      {sup.email && (
                        <p className="text-[12px] text-neutral-400 font-normal">
                          {sup.email}
                        </p>
                      )}
                      {sup.notes && (
                        <p className="text-[12px] text-neutral-400 font-normal mt-0.5 italic">
                          Nota: {sup.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FAB */}
            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="fixed bottom-24 right-6 h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg hover:bg-emerald-700 active:scale-95 transition-all z-20"
              aria-label="Registrar proveedor"
              type="button"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>
        );

      case "EVENTOS":
        return (
          <div className="mt-3 flex flex-col">
            {hasEvents ? (
              <div className="divide-y divide-slate-100 bg-white">
                {dayEvents.map((ev) => (
                  <AgendaEventRow key={ev.id} event={ev} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-neutral-450 bg-white rounded-2xl border border-slate-50 mt-2 mx-2">
                <p className="text-[13px] font-normal text-slate-400">
                  No hay turnos agendados para este día
                </p>
              </div>
            )}

            <HomeAgendaDetailsDrawer
              open={detailsOpen}
              date={selectedDate}
              events={dayEvents}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        );

      case "TODOS":
      default:
        return (
          <>
            {hasEvents && (
              <div className="mt-3">
                {visibleEvents.length > 0 && (
                  <div className="divide-y divide-slate-100 bg-white">
                    {visibleEvents.map((ev) => (
                      <AgendaEventRow key={ev.id} event={ev} />
                    ))}

                    {dayEvents.length > 3 && (
                      <button
                        onClick={() => {
                          if (onOpenDetailedAgenda) {
                            onOpenDetailedAgenda(selectedDate);
                            return;
                          }
                          setDetailsOpen(true);
                        }}
                        className="w-full py-3 text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700 bg-white border-t border-slate-100 hover:bg-slate-50 transition-colors"
                        type="button"
                      >
                        Ver los {dayEvents.length - 3} turnos restantes
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <HomeAgendaDetailsDrawer
              open={detailsOpen}
              date={selectedDate}
              events={dayEvents}
              onClose={() => setDetailsOpen(false)}
            />
          </>
        );
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        isFullScreen
          ? "min-h-[calc(100vh-72px-env(safe-area-inset-top,0px))]"
          : "pb-1",
      )}
    >
      {/* ── Filter pills bar (always visible) ── */}
      <div className="px-4">
        {/* Calendar: only visible in TODOS mode */}
        {!isFullScreen && (
          <DayPickerCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            markedDateKeys={eventDateKeys}
            id="home-agenda-calendar"
          />
        )}

        <div className={cn("flex items-center gap-2", isFullScreen ? "mt-1" : "mt-3")}>
          <button
            type="button"
            onClick={() => scrollFilters("left")}
            className="hidden md:grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
            aria-label="Scroll filtros a la izquierda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div
            ref={filtersRef}
            className="flex flex-nowrap min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {(
              [
                { key: "TODOS", label: "Todos" },
                { key: "EVENTOS", label: "Eventos" },
                { key: "PROVEEDORES", label: "Proveedores" },
                { key: "CLIENTES", label: "Clientes" },
              ] as const
            ).map((opt) => {
              const active = filter === opt.key;
              const isDisabled = opt.key === "CLIENTES" || opt.key === "PROVEEDORES";
              return (
                <button
                  key={opt.key}
                  disabled={isDisabled}
                  onClick={() => {
                    setFilter(opt.key);
                    onFilterChange?.(opt.key);
                  }}
                  className={cn(
                    "shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition flex items-center gap-1.5",
                    active
                      ? "bg-[#E6EFF5] text-[#0B3F64] font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/80",
                    isDisabled && "opacity-50 cursor-not-allowed bg-slate-100/70 text-slate-400"
                  )}
                  type="button"
                >
                  {isDisabled && <Lock className="h-3 w-3 shrink-0" />}
                  {opt.label}
                  {opt.key === "EVENTOS" && pendingEventsCount > 0 && (
                    <span
                      className={cn(
                        "w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-medium ml-1.5 shrink-0 leading-none",
                        active ? "bg-[#0B3F64] text-white" : "bg-slate-500 text-white"
                      )}
                    >
                      {pendingEventsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollFilters("right")}
            className="hidden md:grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
            aria-label="Scroll filtros a la derecha"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Dynamic content area ── */}
      {renderCategoryContent()}

      {/* ── Supplier Registration Modal ── */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl relative flex flex-col">
            <button
              onClick={() => setIsSupplierModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:bg-neutral-100 transition"
              type="button"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-[17px] font-semibold text-neutral-800 mb-4">
              Registrar Nuevo Proveedor
            </h3>

            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-neutral-500 mb-1">
                  Nombre del Proveedor
                </label>
                <input
                  type="text"
                  required
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  placeholder="Ej: Distribuidora San Juan"
                  className="w-full px-4 py-2 border border-slate-100 bg-slate-50 rounded-2xl text-[14px] outline-none focus:border-emerald-300 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-500 mb-1">
                  Teléfono de Contacto
                </label>
                <input
                  type="tel"
                  required
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="Ej: +54 9 264 456-7890"
                  className="w-full px-4 py-2 border border-slate-100 bg-slate-50 rounded-2xl text-[14px] outline-none focus:border-emerald-300 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-500 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  placeholder="Ej: contacto@insumos.com"
                  className="w-full px-4 py-2 border border-slate-100 bg-slate-50 rounded-2xl text-[14px] outline-none focus:border-emerald-300 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-500 mb-1">
                  Categoría
                </label>
                <input
                  type="text"
                  value={newSupplier.category}
                  onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })}
                  placeholder="Ej: Bebidas, Packaging"
                  className="w-full px-4 py-2 border border-slate-100 bg-slate-50 rounded-2xl text-[14px] outline-none focus:border-emerald-300 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-500 mb-1">
                  Notas / Detalles
                </label>
                <textarea
                  value={newSupplier.notes}
                  onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                  placeholder="Ej: Entregas los martes por la mañana."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-100 bg-slate-50 rounded-2xl text-[14px] outline-none resize-none focus:border-emerald-300 focus:bg-white transition"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="flex-1 py-2.5 rounded-full border border-slate-100 hover:bg-slate-50 text-[14px] font-medium text-neutral-500 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-medium transition"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

