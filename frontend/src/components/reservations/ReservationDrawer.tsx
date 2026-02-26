// src/components/reservations/ReservationDrawer.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

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
    /** si querés pasar horarios desde afuera */
    timeSlots?: string[];
    /** callback al confirmar */
    onConfirm?: (data: ReservationData) => void;
};

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

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

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
function clampDateToMonth(day: number, baseMonth: Date) {
    const last = endOfMonth(baseMonth).getDate();
    const d = Math.min(Math.max(day, 1), last);
    return new Date(baseMonth.getFullYear(), baseMonth.getMonth(), d);
}

function buildMonthGrid(month: Date) {
    // devuelve 6 semanas * 7 dias (42 celdas)
    const first = startOfMonth(month);
    const last = endOfMonth(month);

    const firstWeekday = first.getDay(); // 0..6 (D..S)
    const daysInMonth = last.getDate();

    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    // prev month tail
    const prevMonthLast = endOfMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
    const prevDays = prevMonthLast.getDate();

    for (let i = 0; i < firstWeekday; i++) {
        const day = prevDays - (firstWeekday - 1 - i);
        const d = new Date(month.getFullYear(), month.getMonth() - 1, day);
        cells.push({ date: d, inMonth: false });
    }

    // current month
    for (let day = 1; day <= daysInMonth; day++) {
        cells.push({ date: new Date(month.getFullYear(), month.getMonth(), day), inMonth: true });
    }

    // next month head to reach 42
    const remaining = 42 - cells.length;
    for (let day = 1; day <= remaining; day++) {
        const d = new Date(month.getFullYear(), month.getMonth() + 1, day);
        cells.push({ date: d, inMonth: false });
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
    subtitle = "Disponibilidad para el mes actual",
    timeSlots = ["09:00 AM", "10:00 AM", "11:00 AM", "02:00 PM", "03:00 PM", "04:00 PM"],
    onConfirm,
}: ReservationDrawerProps) {
    const today = useMemo(() => new Date(), []);
    const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(timeSlots[0] ?? null);

    const [fullName, setFullName] = useState("");
    const [whatsapp, setWhatsapp] = useState("");

    // Reset básico al abrir (opcional)
    useEffect(() => {
        if (!open) return;
        setViewMonth(startOfMonth(today));
    }, [open, today]);

    const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

    const monthLabel = useMemo(() => {
        const m = MONTHS_ES[viewMonth.getMonth()];
        return `${m} ${viewMonth.getFullYear()}`;
    }, [viewMonth]);

    const canConfirm = !!selectedDate && !!selectedTime;

    function prevMonth() {
        setViewMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)));
        // si tenías una fecha elegida, la clamp para no explotar
        setSelectedDate((d) => (d ? clampDateToMonth(d.getDate(), new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)) : d));
    }
    function nextMonth() {
        setViewMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)));
        setSelectedDate((d) => (d ? clampDateToMonth(d.getDate(), new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)) : d));
    }

    function handlePickDate(d: Date, inMonth: boolean) {
        if (!inMonth) return; // en el mock de la UI, los de afuera casi no se usan
        setSelectedDate(d);
    }

    function handleConfirm() {
        const payload: ReservationData = {
            date: selectedDate,
            time: selectedTime,
            fullName,
            whatsapp,
        };
        onConfirm?.(payload);
    }

    // ESC para cerrar
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <div
            className={cn(
                "fixed inset-0 z-50",
                open ? "pointer-events-auto" : "pointer-events-none"
            )}
            aria-hidden={!open}
        >
            {/* Backdrop */}
            <div
                className={cn(
                    "absolute inset-0 bg-black/30 transition-opacity",
                    open ? "opacity-100" : "opacity-0"
                )}
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={cn(
                    "absolute inset-x-0 bottom-0 mx-auto w-full max-w-md",
                    "transition-transform duration-300",
                    open ? "translate-y-0" : "translate-y-[105%]"
                )}
                role="dialog"
                aria-modal="true"
            >
                <div className="relative h-[92vh] rounded-t-3xl bg-[#F4F6F4] shadow-2xl">
                    {/* Header */}
                    <div className="sticky top-0 z-10 rounded-t-3xl bg-white/70 backdrop-blur">
                        <div className="flex items-center gap-3 px-5 py-4">
                            <button
                                onClick={onClose}
                                className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/5 active:scale-[0.98]"
                                aria-label="Volver"
                            >
                                <span className="text-xl leading-none">‹</span>
                            </button>
                            <div className="flex-1 text-center">
                                <div className="text-lg font-semibold text-black">{title}</div>
                            </div>
                            <div className="h-10 w-10" />
                        </div>
                    </div>

                    {/* Body scroll */}
                    <div className="h-full overflow-y-auto px-5 pb-28 pt-4">
                        {/* Fecha */}
                        <div className="mb-4">
                            <div className="text-2xl font-semibold text-black">Selecciona una fecha</div>
                            <div className="mt-1 text-sm text-black/50">{subtitle}</div>
                        </div>

                        {/* Calendar card */}
                        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={prevMonth}
                                    className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-black/5 active:scale-[0.98]"
                                    aria-label="Mes anterior"
                                >
                                    <span className="text-xl leading-none">‹</span>
                                </button>

                                <div className="text-base font-semibold text-black">{monthLabel}</div>

                                <button
                                    onClick={nextMonth}
                                    className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-black/5 active:scale-[0.98]"
                                    aria-label="Mes siguiente"
                                >
                                    <span className="text-xl leading-none">›</span>
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-7 gap-2 px-1">
                                {WEEKDAYS.map((w, idx) => (
                                    <div
                                        key={`${w}-${idx}`}
                                        className="text-center text-xs font-semibold tracking-wide text-black/35"
                                    >
                                        {w}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-3 grid grid-cols-7 gap-2 px-1">
                                {grid.map(({ date, inMonth }, i) => {
                                    const isSelected = selectedDate ? sameDay(selectedDate, date) : false;
                                    const isToday = sameDay(today, date);

                                    return (
                                        <button
                                            key={`${date.toISOString()}-${i}`}
                                            onClick={() => handlePickDate(date, inMonth)}
                                            disabled={!inMonth}
                                            className={cn(
                                                "h-11 w-11 rounded-full text-sm font-medium transition",
                                                inMonth ? "text-black" : "text-black/20",
                                                isSelected
                                                    ? "bg-[#22C55E] text-black shadow-sm"
                                                    : "bg-transparent",
                                                !isSelected && inMonth ? "hover:bg-black/5 active:bg-black/10" : "",
                                                isToday && !isSelected ? "ring-1 ring-black/10" : "",
                                                !inMonth ? "cursor-not-allowed" : ""
                                            )}
                                            aria-label={`Día ${date.getDate()}`}
                                        >
                                            {date.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Horarios */}
                        <div className="mt-8">
                            <div className="text-2xl font-semibold text-black">Selecciona un horario</div>

                            <div className="mt-4 grid grid-cols-3 gap-3">
                                {timeSlots.map((t) => {
                                    const active = selectedTime === t;
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => setSelectedTime(t)}
                                            className={cn(
                                                "h-12 rounded-full border text-sm font-semibold transition",
                                                active
                                                    ? "border-transparent bg-[#CFF8DC] text-black shadow-sm"
                                                    : "border-black/10 bg-white text-black/80 hover:bg-black/5"
                                            )}
                                        >
                                            {t}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Datos de contacto */}
                        <div className="mt-10">
                            <div className="text-2xl font-semibold text-black">Datos de contacto</div>

                            <div className="mt-5 space-y-5">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-black/70">
                                        Nombre completo
                                    </label>
                                    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                                        <input
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Ej. Juan Pérez"
                                            className="w-full bg-transparent text-base text-black placeholder:text-black/35 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-black/70">
                                        WhatsApp
                                    </label>
                                    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-black/5">
                                            <span className="text-lg">📱</span>
                                        </div>
                                        <input
                                            value={whatsapp}
                                            onChange={(e) => setWhatsapp(e.target.value)}
                                            placeholder="+54 9 11 1234 5678"
                                            inputMode="tel"
                                            className="w-full bg-transparent text-base text-black placeholder:text-black/35 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom action */}
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-[#F4F6F4] px-5 pb-5 pt-3">
                        <button
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            className={cn(
                                "h-14 w-full rounded-full text-base font-semibold shadow-lg transition",
                                canConfirm
                                    ? "bg-[#22C55E] text-black active:scale-[0.99]"
                                    : "bg-black/10 text-black/40"
                            )}
                        >
                            Confirmar Reserva{" "}
                            <span className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full bg-black/10">
                                ✓
                            </span>
                        </button>

                        <div className="mt-3 text-center text-xs text-black/35">
                            Al confirmar, recibirás un mensaje de confirmación por WhatsApp.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}