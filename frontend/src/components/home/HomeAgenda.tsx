"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

type AgendaFilter = "TODOS" | AgendaEventStatus;

function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function getInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "-";
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
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-base font-semibold text-emerald-700">
        {getInitial(event.customerName)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{event.customerName}</p>
          <div className="shrink-0">
            <span className="whitespace-nowrap text-xs font-medium text-green-500">
              {formatTimeLabel(event.scheduledAt)}
            </span>
          </div>
        </div>

        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm leading-snug text-neutral-400">
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
  const filtersRef = useRef<HTMLDivElement | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
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
    <div className="px-4 pb-3">
      <DayPickerCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        markedDateKeys={eventDateKeys}
        id="home-agenda-calendar"
      />

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
                  "shrink-0 px-4 py-2 rounded-full text-sm font-semibold ring-1 transition",
                  active
                    ? "bg-[#11d473] text-white ring-emerald-200"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                )}
                type="button"
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
                type="button"
              >
                Ver todo
              </button>
            )}
          </div>

          {hasFilteredEvents && (
            <div className="mt-3">
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
