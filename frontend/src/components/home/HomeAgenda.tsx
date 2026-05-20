"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import type { Sale } from "@/src/types/sales";
import { cn } from "@/src/lib/utils";
import { formatLocalDateKey } from "@/src/lib/datetime";
import {
  getAgendaEventDateKeys,
  getAgendaEventsForDate,
  type AgendaEvent,
  type AgendaEventStatus,
} from "@/src/lib/agenda/events";
import { HomeAgendaDetailsDrawer } from "@/src/components/home/HomeAgendaDetails";

type AgendaFilter = "TODOS" | AgendaEventStatus;

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"] as const;

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);

  const firstWeekday = first.getDay();
  const daysInMonth = last.getDate();

  const cells: Array<{ date: Date; inMonth: boolean }> = [];

  const prevMonthLast = endOfMonth(
    new Date(month.getFullYear(), month.getMonth() - 1, 1),
  );
  const prevDays = prevMonthLast.getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const day = prevDays - (firstWeekday - 1 - i);
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth() - 1, day),
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth(), day),
      inMonth: true,
    });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth() + 1, day),
      inMonth: false,
    });
  }

  return cells;
}

function formatDayPillLabel(date: Date) {
  const parts = date
    .toLocaleDateString("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .replace(/\.$/, "");

  return parts.replace(/\./g, "").replace(/\s+de\s+/g, " ");
}

function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function getInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "•";
}

function statusBadgeStyle(status: AgendaEventStatus) {
  switch (status) {
    case "CONFIRMADO":
      return "bg-emerald-100 text-emerald-700";
    case "PENDIENTE":
      return "bg-amber-100 text-amber-800";
    case "CANCELADO":
      return "bg-red-100 text-red-700";
    case "COMPLETADO":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function AgendaEventRow({ event }: { event: AgendaEvent }) {
  return (
    <div className="flex items-center gap-3 py-3 hover:bg-neutral-50">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-base font-semibold">
        {getInitial(event.customerName)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate">{event.customerName}</p>
          <div className="shrink-0">
            <span className="text-xs font-medium text-green-500 whitespace-nowrap">
              {formatTimeLabel(event.scheduledAt)}
            </span>
          </div>
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-neutral-400 leading-snug">
            {event.description}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
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
}: {
  sales: Sale[];
  onOpenDetailedAgenda?: (date: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filter, setFilter] = useState<AgendaFilter>("TODOS");

  const eventDateKeys = useMemo(() => getAgendaEventDateKeys(sales), [sales]);
  const dayEvents = useMemo(
    () => getAgendaEventsForDate(sales, selectedDate),
    [sales, selectedDate],
  );
  const filteredDayEvents = useMemo(() => {
    if (filter === "TODOS") return dayEvents;
    return dayEvents.filter((ev) => ev.status === filter);
  }, [dayEvents, filter]);

  const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const monthLabel = useMemo(
    () => `${MONTHS_ES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`,
    [viewMonth],
  );

  useEffect(() => {
    if (!calendarOpen) return;

    function onDocMouseDown(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setCalendarOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [calendarOpen]);

  function moveSelectedDay(deltaDays: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + deltaDays);
    setSelectedDate(next);
    setViewMonth(startOfMonth(next));
  }

  function selectDate(d: Date) {
    setSelectedDate(d);
    setViewMonth(startOfMonth(d));
    setCalendarOpen(false);
  }

  const pillLabel = useMemo(
    () => formatDayPillLabel(selectedDate),
    [selectedDate],
  );

  const hasEvents = dayEvents.length > 0;
  const hasFilteredEvents = filteredDayEvents.length > 0;
  const visibleEvents = hasFilteredEvents ? filteredDayEvents.slice(0, 3) : [];

  function scrollFilters(direction: "left" | "right") {
    filtersRef.current?.scrollBy({
      left: direction === "left" ? -140 : 140,
      behavior: "smooth",
    });
  }

  return (
    <div ref={containerRef} className="px-4 pt-4 border-b border-gray-100">
      <div className="relative">
        <div className="flex items-center justify-between rounded-full bg-slate-100 px-3 py-2">
          <button
            onClick={() => moveSelectedDay(-1)}
            className="rounded-full p-2 text-neutral-500 hover:bg-white/60"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-white/60"
            aria-expanded={calendarOpen}
            aria-controls="home-agenda-calendar"
          >
            <Calendar className="h-4 w-4 text-neutral-500" />
            <span className="capitalize">{pillLabel}</span>
          </button>

          <button
            onClick={() => moveSelectedDay(1)}
            className="rounded-full p-2 text-neutral-500 hover:bg-white/60"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {calendarOpen && (
          <div
            id="home-agenda-calendar"
            className="absolute left-0 right-0 top-full z-30 mt-2 rounded-3xl border border-black/5 bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.10)]"
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() =>
                  setViewMonth(
                    startOfMonth(
                      new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
                    ),
                  )
                }
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="text-sm font-semibold text-neutral-900">
                {monthLabel}
              </div>

              <button
                onClick={() =>
                  setViewMonth(
                    startOfMonth(
                      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
                    ),
                  )
                }
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-center text-neutral-400">
              {WEEKDAYS.map((w, i) => (
                <div key={`${w}-${i}`}>{w}</div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2">
              {monthGrid.map(({ date, inMonth }, idx) => {
                const isSelected = sameDay(selectedDate, date);
                const key = formatLocalDateKey(date);
                const hasDot = eventDateKeys.has(key);

                return (
                  <button
                    key={`${key}-${idx}`}
                    onClick={() => selectDate(date)}
                    className={cn(
                      "relative h-10 rounded-full text-sm",
                      isSelected
                        ? "bg-emerald-500 text-white"
                        : inMonth
                          ? "bg-white text-neutral-900 hover:bg-emerald-50"
                          : "bg-white text-neutral-300 hover:bg-neutral-50",
                    )}
                    aria-label={date.toLocaleDateString("es-AR")}
                  >
                    {date.getDate()}
                    {hasDot && !isSelected && (
                      <span className="absolute left-1/2 top-[30px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {hasEvents && (
        <div className="mt-4">
          <div className="flex items-center justify-between px-2">
            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
              Eventos de hoy
            </div>
            {dayEvents.length > 3 && (
              <button
                onClick={() => {
                  if (onOpenDetailedAgenda) {
                    onOpenDetailedAgenda(selectedDate);
                    return;
                  }
                  setDetailsOpen(true);
                }}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Ver todo
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => scrollFilters("left")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
              aria-label="Scroll filtros a la izquierda"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div
              ref={filtersRef}
              className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
            {(
              [
                { key: "TODOS", label: "Todos" },
                { key: "PENDIENTE", label: "Pendiente" },
                { key: "CONFIRMADO", label: "Confirmado" },
                { key: "COMPLETADO", label: "Completado" },
                { key: "CANCELADO", label: "Cancelado" },
              ] as const
            ).map((opt) => {
              const active = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition",
                    active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-neutral-700 hover:bg-slate-200",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
            </div>

            <button
              type="button"
              onClick={() => scrollFilters("right")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
              aria-label="Scroll filtros a la derecha"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {hasFilteredEvents && (
            <div className="mt-1">
              {visibleEvents.map((ev) => (
                <AgendaEventRow key={ev.id} event={ev} />
              ))}
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
    </div>
  );
}
