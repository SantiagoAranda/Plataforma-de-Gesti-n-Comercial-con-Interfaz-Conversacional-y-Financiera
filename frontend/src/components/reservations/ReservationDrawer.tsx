"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatLocalDateKey } from "@/src/lib/datetime";

type ReservationData = {
  date: Date | null;
  time: string | null;
  fullName: string;
  whatsapp: string;
};

type ReservationDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  timeSlots?: string[];
  availableDates?: string[];
  selectedDateValue?: string | null;
  initialFullName?: string;
  initialWhatsapp?: string;
  onDateChange?: (date: Date) => void;
  onMonthChange?: (month: Date) => void;
  onConfirm?: (data: ReservationData) => void;
};

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"] as const;

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
    new Date(month.getFullYear(), month.getMonth() - 1, 1)
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

export default function ReservationDrawer({
  open,
  onClose,
  title = "Reservar Servicio",
  subtitle = "Selecciona dia y horario disponible",
  timeSlots = [],
  availableDates = [],
  selectedDateValue,
  initialFullName = "",
  initialWhatsapp = "",
  onDateChange,
  onMonthChange,
  onConfirm,
}: ReservationDrawerProps) {
  const today = useMemo(() => new Date(), []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    if (!open) return;

    const initialDate = selectedDateValue
      ? new Date(`${selectedDateValue}T00:00:00`)
      : null;

    setViewMonth(startOfMonth(initialDate ?? today));
    setSelectedDate(initialDate);
    setSelectedTime(null);
    setFullName(initialFullName);
    setWhatsapp(initialWhatsapp);
  }, [initialFullName, initialWhatsapp, open, selectedDateValue, today]);

  useEffect(() => {
    if (!open) return;
    onMonthChange?.(viewMonth);
  }, [open, onMonthChange, viewMonth]);

  useEffect(() => {
    setSelectedTime(null);
  }, [timeSlots]);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);

  const monthLabel = useMemo(() => {
    return `${MONTHS_ES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  }, [viewMonth]);

  const canConfirm =
    !!selectedDate &&
    !!selectedTime &&
    fullName.trim().length >= 2 &&
    whatsapp.trim().length >= 8;

  function handlePickDate(d: Date, inMonth: boolean) {
    const key = formatLocalDateKey(d);
    if (!inMonth || !availableDateSet.has(key)) return;
    setSelectedDate(d);
    onDateChange?.(d);
  }

  function handleConfirm() {
    if (!canConfirm) return;

    onConfirm?.({
      date: selectedDate,
      time: selectedTime,
      fullName: fullName.trim(),
      whatsapp: whatsapp.trim(),
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md">
        <div className="relative h-[92vh] rounded-t-3xl bg-[#F4F6F4] shadow-2xl flex flex-col">
          <div className="sticky top-0 z-10 rounded-t-3xl bg-white/70 backdrop-blur">
            <div className="flex items-center gap-3 px-5 py-4">
              <button
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/5"
              >
                {"<"}
              </button>
              <div className="flex-1 text-center font-semibold">
                {title}
              </div>
              <div className="h-10 w-10" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-4">
            <div className="mb-4">
              <div className="text-2xl font-semibold">
                Selecciona una fecha
              </div>
              <div className="text-sm text-black/50">
                {subtitle}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex justify-between items-center">
                <button
                  onClick={() =>
                    setViewMonth(
                      startOfMonth(
                        new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                      )
                    )
                  }
                >
                  {"<"}
                </button>

                <div className="font-semibold">{monthLabel}</div>

                <button
                  onClick={() =>
                    setViewMonth(
                      startOfMonth(
                        new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                      )
                    )
                  }
                >
                  {">"}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-center text-black/40">
                {WEEKDAYS.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-7 gap-2">
                {grid.map(({ date, inMonth }, i) => {
                  const selected = selectedDate && sameDay(selectedDate, date);
                  const dateKey = formatLocalDateKey(date);
                  const isAvailable = inMonth && availableDateSet.has(dateKey);

                  return (
                    <button
                      key={i}
                      disabled={!isAvailable}
                      onClick={() => handlePickDate(date, inMonth)}
                      className={cn(
                        "h-10 rounded-full text-sm",
                        selected
                          ? "bg-emerald-500 text-white"
                          : isAvailable
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "text-black/20"
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8">
              <div className="text-xl font-semibold">
                Selecciona un horario
              </div>

              {selectedDate && timeSlots.length === 0 && (
                <div className="mt-3 text-sm text-black/40">
                  No hay horarios disponibles para este dia.
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-3">
                {timeSlots.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    className={cn(
                      "h-12 rounded-full border text-sm font-semibold",
                      selectedTime === t
                        ? "bg-[#CFF8DC]"
                        : "bg-white border-black/10"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 space-y-4">
              <input
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border px-4 py-3"
              />
              <input
                placeholder="WhatsApp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full rounded-xl border px-4 py-3"
              />
            </div>
          </div>

          <div className="bg-[#F4F6F4] px-5 pb-5 pt-3">
            <button
              disabled={!canConfirm}
              onClick={handleConfirm}
              className={cn(
                "w-full h-14 rounded-full font-semibold",
                canConfirm
                  ? "bg-emerald-500 text-white"
                  : "bg-black/10 text-black/40"
              )}
            >
              Confirmar Reserva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
