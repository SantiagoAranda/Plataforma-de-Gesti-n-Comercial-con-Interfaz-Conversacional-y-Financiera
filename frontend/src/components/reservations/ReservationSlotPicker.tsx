"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/src/lib/api";
import { formatLocalDateKey } from "@/src/lib/datetime";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"] as const;
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

type Mode = "public" | "private";

type Props = {
  itemId: string;
  businessSlug?: string;
  mode: Mode;
  selectedDate?: string | null;
  selectedStartMinute?: number | null;
  onChange: (value: {
    date: string | null;
    time: string | null;
    startMinute: number | null;
  }) => void;
  className?: string;
};

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

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatMonthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value: number | null | undefined) {
  if (value == null) return null;
  const hour = String(Math.floor(value / 60)).padStart(2, "0");
  const minute = String(value % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export default function ReservationSlotPicker({
  itemId,
  businessSlug,
  mode,
  selectedDate,
  selectedStartMinute,
  onChange,
  className,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const initialDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : today;
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialDate));
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [isLoadingDays, setIsLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const selectedTime = timeFromMinutes(selectedStartMinute);
  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const monthLabel = useMemo(
    () => `${MONTHS_ES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`,
    [viewMonth],
  );

  const fetchJson = useCallback(async <T,>(path: string) => {
    if (mode === "private") return api<T>(path);
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) throw new Error("Error loading availability");
    return (await res.json()) as T;
  }, [mode]);

  useEffect(() => {
    if (!itemId) return;
    if (mode === "public" && !businessSlug) return;

    const month = formatMonthParam(viewMonth);
    const path =
      mode === "public"
        ? `/public/${businessSlug}/availability-calendar?itemId=${itemId}&month=${month}`
        : `/reservations/availability-calendar?itemId=${itemId}&month=${month}`;

    let alive = true;
    setIsLoadingDays(true);
    setLoadingDates(true);
    fetchJson<string[]>(path)
      .then((data) => {
        if (alive) setAvailableDates(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setAvailableDates([]);
      })
      .finally(() => {
        if (alive) {
          setIsLoadingDays(false);
          setLoadingDates(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [businessSlug, fetchJson, itemId, mode, viewMonth]);

  useEffect(() => {
    if (!itemId || !selectedDate) {
      setTimeSlots([]);
      return;
    }
    if (mode === "public" && !businessSlug) return;

    // Si aún se están consultando las fechas disponibles del mes, no buscamos horarios aún
    if (isLoadingDays) return;

    const path =
      mode === "public"
        ? `/public/${businessSlug}/availability?itemId=${itemId}&date=${selectedDate}`
        : `/reservations/availability?itemId=${itemId}&date=${selectedDate}`;

    let alive = true;
    setLoadingSlots(true);
    fetchJson<string[]>(path)
      .then((data) => {
        if (!alive) return;
        const slots = Array.isArray(data) ? data : [];
        setTimeSlots(slots);
        if (selectedTime && !slots.includes(selectedTime)) {
          onChangeRef.current({ date: selectedDate, time: null, startMinute: null });
        }
      })
      .catch(() => {
        if (alive) setTimeSlots([]);
      })
      .finally(() => {
        if (alive) setLoadingSlots(false);
      });

    return () => {
      alive = false;
    };
  }, [businessSlug, fetchJson, itemId, mode, selectedDate, selectedTime, isLoadingDays]);

  function handlePickDate(date: Date, inMonth: boolean) {
    const key = formatLocalDateKey(date);
    if (!inMonth || !availableDateSet.has(key)) return;
    onChangeRef.current({ date: key, time: null, startMinute: null });
  }

  function handlePickTime(time: string) {
    onChangeRef.current({
      date: selectedDate ?? null,
      time,
      startMinute: minutesFromTime(time),
    });
  }

  return (
    <div className={className}>
      <div className="mb-3">
        <div className="text-lg font-medium text-neutral-800">Selecciona una fecha</div>
        <div className="text-xs text-neutral-500">
          Selecciona día y horario disponible
        </div>
      </div>

      <div className="relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 overflow-hidden">
        {/* Spinner visual de carga cubriendo el calendario con glassmorphism */}
        {isLoadingDays && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[1.5px] rounded-3xl transition-all duration-300">
            <svg
              className="animate-spin h-8 w-8 text-emerald-500 mb-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-xs font-semibold text-emerald-700">Cargando fechas...</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={isLoadingDays}
            onClick={() =>
              setViewMonth(
                startOfMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)),
              )
            }
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="font-semibold">{monthLabel}</div>

          <button
            type="button"
            disabled={isLoadingDays}
            onClick={() =>
              setViewMonth(
                startOfMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)),
              )
            }
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-neutral-400">
          {WEEKDAYS.map((w, i) => (
            <div key={`${w}-${i}`}>{w}</div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-7 gap-1.5">
          {grid.map(({ date, inMonth }, i) => {
            const dateKey = formatLocalDateKey(date);
            const selected = selectedDate && sameDay(new Date(`${selectedDate}T00:00:00`), date);
            const isAvailable = inMonth && availableDateSet.has(dateKey);

            return (
              <button
                key={`${dateKey}-${i}`}
                type="button"
                disabled={isLoadingDays || !isAvailable}
                onClick={() => handlePickDate(date, inMonth)}
                className={cn(
                  "h-8 w-8 mx-auto flex items-center justify-center rounded-full text-xs font-semibold transition-all duration-200",
                  selected
                    ? "bg-emerald-500 text-white shadow-sm"
                    : isAvailable
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "text-neutral-300",
                  isLoadingDays && "opacity-50 cursor-not-allowed",
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        {loadingDates && (
          <div className="mt-3 text-center text-xs font-semibold text-black/40">
            Cargando disponibilidad...
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Horarios Disponibles</div>

        {selectedDate && !loadingSlots && timeSlots.length === 0 && (
          <div className="mt-3 text-sm text-black/40">
            No hay horarios disponibles para este día.
          </div>
        )}

        {loadingSlots && (
          <div className="mt-3 text-sm text-black/40">Cargando horarios...</div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          {timeSlots.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => handlePickTime(time)}
              className={cn(
                "h-10 rounded-xl border text-xs font-medium transition-all duration-150",
                selectedTime === time
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
              )}
            >
              {time}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
