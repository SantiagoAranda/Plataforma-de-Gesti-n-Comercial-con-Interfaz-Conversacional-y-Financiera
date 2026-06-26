"use client";

import React, { useEffect, useRef, useState } from "react";
import ReservationSlotPicker from "./ReservationSlotPicker";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import { CheckCircle, Copy, Check } from "lucide-react";
import { formatLocalDateKey } from "@/src/lib/datetime";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  itemId?: string;
  businessSlug?: string;
  mode?: "public" | "private";
  selectedDateValue?: string | null;
  initialFullName?: string;
  initialWhatsapp?: string;
  onConfirm?: (data: ReservationData) => void;
  // Contexto del servicio para el fetch interno (modo público)
  serviceDurationMinutes?: number;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function ReservationDrawer({
  open,
  onClose,
  title = "Reservar Servicio",
  itemId,
  businessSlug,
  mode = "public",
  selectedDateValue,
  initialFullName = "",
  initialWhatsapp = "",
  onConfirm,
  serviceDurationMinutes,
}: ReservationDrawerProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(selectedDateValue ?? null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedStartMinute, setSelectedStartMinute] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phone, setPhone] = useState("");

  // ── Estados de éxito ──────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [appointmentLink, setAppointmentLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Refs para capturar los valores iniciales en el momento en que el drawer se abre,
  // sin agregarlos como dependencias del efecto (evita el reset al re-renderizar el padre).
  const initialFullNameRef = useRef(initialFullName);
  const initialWhatsappRef = useRef(initialWhatsapp);
  const selectedDateValueRef = useRef(selectedDateValue);

  useEffect(() => {
    initialFullNameRef.current = initialFullName;
  }, [initialFullName]);

  useEffect(() => {
    initialWhatsappRef.current = initialWhatsapp;
  }, [initialWhatsapp]);

  useEffect(() => {
    selectedDateValueRef.current = selectedDateValue;
  }, [selectedDateValue]);

  // Solo se ejecuta cuando el drawer se ABRE (open: false → true).
  useEffect(() => {
    if (!open) return;

    // Resetear TODOS los estados de la sesión anterior al abrir
    setSelectedDate(selectedDateValueRef.current ?? null);
    setSelectedTime(null);
    setSelectedStartMinute(null);
    setFullName(initialFullNameRef.current);
    setIsSuccess(false);
    setAppointmentLink("");
    setCopied(false);
    setIsSubmitting(false);

    const raw = initialWhatsappRef.current.replace(/\D/g, "");
    const matched = ["57", "54", "52", "34", "56", "51"].find(code => raw.startsWith(code));
    if (matched) {
      setCountryCode(matched);
      setPhone(raw.slice(matched.length));
    } else {
      setCountryCode("57");
      setPhone(raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canConfirm =
    !!selectedDate &&
    !!selectedTime &&
    fullName.trim().length >= 2 &&
    phone.trim().length >= 6;

  // ── handleConfirm: lógica de fetch integrada en el Drawer ─────
  async function handleConfirm() {
    if (!canConfirm || isSubmitting) return;

    const whatsapp = `+${countryCode}${phone}`;
    const date = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;

    // Si hay un onConfirm externo (ej: modo privado / admin), lo delegamos
    if (onConfirm) {
      onConfirm({
        date,
        time: selectedTime,
        fullName: fullName.trim(),
        whatsapp,
      });
      return;
    }

    // Modo público: fetch directo
    if (!itemId || !businessSlug || !selectedTime || !date) return;

    const [h, m] = selectedTime.split(":").map(Number);
    const startMinute = h * 60 + m;
    const endMinute = startMinute + (serviceDurationMinutes ?? 60);

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/public/${businessSlug}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          customerName: fullName.trim(),
          customerWhatsapp: whatsapp,
          date: formatLocalDateKey(date),
          startMinute,
          endMinute,
        }),
      });

      if (!res.ok) throw new Error("Error creating reservation");

      const reservation = await res.json();
      const id = reservation?.id ?? "";
      const link = id
        ? `${window.location.origin}/reserva/${id}`
        : `${window.location.origin}/reserva`;

      setAppointmentLink(link);
      setIsSuccess(true);
    } catch {
      // Dejamos el manejo de error al padre si existe; si no, solo cerramos
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Copiar link ───────────────────────────────────────────────
  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(appointmentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback silencioso
    }
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
          {/* ── Header ─────────────────────────────────────────── */}
          <div className="sticky top-0 z-10 rounded-t-3xl bg-[#F4F6F4] border-b border-black/[0.04]">
            <div className="flex items-center gap-3 px-5 py-3">
              <button
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/5"
              >
                {"<"}
              </button>
              <div className="flex-1 text-center font-semibold">
                {isSuccess ? "¡Reserva Confirmada!" : title}
              </div>
              <div className="h-10 w-10" />
            </div>
          </div>

          {/* ── Contenido dinámico ─────────────────────────────── */}
          {isSuccess ? (
            /* ── PANTALLA DE ÉXITO ─────────────────────────────── */
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
              {/* Ícono celebración */}
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />
              </div>

              <h2 className="mt-6 text-2xl font-bold text-neutral-900">
                ¡Reserva Registrada<br />con Éxito!
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Podés consultar o gestionar tu turno desde el siguiente link:
              </p>

              {/* Recuadro con el link */}
              <div className="mt-6 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-sm">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  Link de tu turno
                </p>
                <p className="break-all text-[13px] font-medium text-neutral-700">
                  {appointmentLink}
                </p>
              </div>

              {/* Botón copiar */}
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition",
                  copied
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-white text-neutral-700 ring-1 ring-black/10 hover:bg-neutral-50"
                )}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar Link
                  </>
                )}
              </button>
            </div>
          ) : (
            /* ── FORMULARIO NORMAL ─────────────────────────────── */
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-3">
              {itemId && (
                <ReservationSlotPicker
                  itemId={itemId}
                  businessSlug={businessSlug}
                  mode={mode}
                  selectedDate={selectedDate}
                  selectedStartMinute={selectedStartMinute}
                  onChange={({ date, time, startMinute }) => {
                    setSelectedDate(date);
                    setSelectedTime(time);
                    setSelectedStartMinute(startMinute);
                  }}
                />
              )}

              <div className="mt-6 space-y-3">
                <input
                  placeholder="Nombre completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
                <PhoneSelector
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  phoneNumber={phone}
                  onPhoneNumberChange={setPhone}
                  dropdownPosition="top"
                />
              </div>
            </div>
          )}

          {/* ── Botón de acción inferior ───────────────────────── */}
          <div className="bg-[#F4F6F4] px-5 pb-5 pt-3">
            {isSuccess ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full h-14 rounded-full bg-emerald-500 font-semibold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
              >
                Entendido
              </button>
            ) : (
              <button
                disabled={!canConfirm || isSubmitting}
                onClick={handleConfirm}
                className={cn(
                  "w-full h-14 rounded-full font-semibold transition",
                  canConfirm && !isSubmitting
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]"
                    : "bg-black/10 text-black/40"
                )}
              >
                {isSubmitting ? "Confirmando..." : "Confirmar Reserva"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
