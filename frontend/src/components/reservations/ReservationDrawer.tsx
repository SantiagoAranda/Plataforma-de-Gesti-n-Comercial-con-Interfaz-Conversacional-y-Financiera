"use client";

import React, { useEffect, useRef, useState } from "react";
import ReservationSlotPicker from "./ReservationSlotPicker";
import PhoneSelector from "@/src/components/shared/PhoneSelector";

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
}: ReservationDrawerProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(selectedDateValue ?? null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedStartMinute, setSelectedStartMinute] = useState<number | null>(null);

  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phone, setPhone] = useState("");

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
  // No depende de initialFullName/initialWhatsapp/selectedDateValue para evitar
  // que un re-render del padre resetee la fecha y los slots seleccionados.
  useEffect(() => {
    if (!open) return;

    setSelectedDate(selectedDateValueRef.current ?? null);
    setSelectedTime(null);
    setSelectedStartMinute(null);
    setFullName(initialFullNameRef.current);

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

  function handleConfirm() {
    if (!canConfirm) return;

    onConfirm?.({
      date: selectedDate ? new Date(`${selectedDate}T00:00:00`) : null,
      time: selectedTime,
      fullName: fullName.trim(),
      whatsapp: `+${countryCode}${phone}`,
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
          <div className="sticky top-0 z-10 rounded-t-3xl bg-[#F4F6F4] border-b border-black/[0.04]">
            <div className="flex items-center gap-3 px-5 py-3">
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
