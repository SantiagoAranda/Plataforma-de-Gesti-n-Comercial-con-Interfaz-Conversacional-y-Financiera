"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { formatLocalDateKey } from "@/src/lib/datetime";
import { cn } from "@/src/lib/utils";

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

export function formatDayPillLabel(date: Date) {
  const parts = date
    .toLocaleDateString("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .replace(/\.$/, "");

  return parts.replace(/\./g, "").replace(/\s+de\s+/g, " ");
}

export function isSameCalendarDay(a: Date, b: Date) {
  return sameDay(a, b);
}

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDateKeys?: Set<string>;
  id?: string;
  className?: string;
};

export default function DayPickerCalendar({
  selectedDate,
  onSelectDate,
  markedDateKeys,
  id = "day-picker-calendar",
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const monthLabel = useMemo(
    () => `${MONTHS_ES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`,
    [viewMonth],
  );
  const pillLabel = useMemo(
    () => formatDayPillLabel(selectedDate),
    [selectedDate],
  );

  useEffect(() => {
    setViewMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

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
    onSelectDate(next);
  }

  function selectDate(d: Date) {
    onSelectDate(d);
    setCalendarOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex h-10 items-center justify-between gap-3 rounded-full bg-slate-100 px-4 shadow-none ring-1 ring-black/5">
        <button
          onClick={() => moveSelectedDay(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/60 active:scale-95"
          aria-label="Dia anterior"
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          onClick={() => setCalendarOpen((v) => !v)}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-2 text-sm text-[#0f172a] outline-none transition hover:bg-white/60 active:scale-95"
          aria-expanded={calendarOpen}
          aria-controls={id}
          type="button"
        >
          <Calendar className="h-4 w-4 text-slate-400" />
          <span className="capitalize">{pillLabel}</span>
        </button>

        <button
          onClick={() => moveSelectedDay(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/60 active:scale-95"
          aria-label="Dia siguiente"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {calendarOpen && (
        <div
          id={id}
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
              type="button"
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
              type="button"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-neutral-400">
            {WEEKDAYS.map((w, i) => (
              <div key={`${w}-${i}`}>{w}</div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {monthGrid.map(({ date, inMonth }, idx) => {
              const isSelected = sameDay(selectedDate, date);
              const key = formatLocalDateKey(date);
              const hasDot = markedDateKeys?.has(key);

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
                  type="button"
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
  );
}
