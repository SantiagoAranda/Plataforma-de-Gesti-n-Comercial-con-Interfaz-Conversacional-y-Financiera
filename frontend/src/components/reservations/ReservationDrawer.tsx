"use client";

import React, { useEffect, useState } from "react";
import ReservationSlotPicker from "./ReservationSlotPicker";

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
  const [countryCode, setCountryCode] = useState("+57");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;

    setSelectedDate(selectedDateValue ?? null);
    setSelectedTime(null);
    setSelectedStartMinute(null);
    setFullName(initialFullName);
    setPhone(initialWhatsapp);
  }, [initialFullName, initialWhatsapp, open, selectedDateValue]);

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
      whatsapp: `${countryCode}${phone}`,
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

          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-4">
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

            <div className="mt-10 space-y-4">
              <input
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border px-4 py-3"
              />
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="rounded-xl border px-3 py-3 bg-white"
                >
                  <option value="+54">🇦🇷 +54</option>
                  <option value="+57">🇨🇴 +57</option>
                  <option value="+52">🇲🇽 +52</option>
                  <option value="+34">🇪🇸 +34</option>
                </select>

                <input
                  type="tel"
                  placeholder="WhatsApp"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3"
                />
              </div>
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
