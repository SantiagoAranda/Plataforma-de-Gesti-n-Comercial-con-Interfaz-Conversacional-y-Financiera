"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Search,
  X,
  ChevronRight,
  Sparkles,
  CalendarX2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock3,
  XCircle,
  Phone,
} from "lucide-react";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import { cn } from "@/src/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type PublicReservationItem = {
  id: string;
  publicToken?: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  customerName: string | null;
  customerWhatsapp: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
  note: string | null;
  createdAt: string;
  item: {
    id: string;
    name: string;
    price: number;
    durationMinutes: number | null;
  };
  business: {
    id: string;
    name: string;
    phoneWhatsapp: string;
  };
};

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const formatted = date.toLocaleDateString("es-CO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    // Capitalize first letter
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return isoDate;
  }
}

function formatCurrency(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const hasDecimals = safeValue % 1 !== 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  })
    .format(safeValue)
    .replace("COP", "$")
    .replace(/\s+/g, "");
}

function StatusBadge({ status }: { status: "PENDING" | "CONFIRMED" | "CANCELLED" }) {
  if (status === "CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        Confirmado
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        <XCircle className="w-3 h-3 text-rose-600" />
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
      <Clock3 className="w-3 h-3 text-amber-700" />
      Pendiente
    </span>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  slug: string;
  businessName?: string;
};

export default function AppointmentLookupModal({
  open,
  onClose,
  slug,
  businessName,
}: Props) {
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [reservations, setReservations] = useState<PublicReservationItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNumber = phoneNumber.replace(/\D/g, "").trim();
    if (!cleanNumber) {
      setErrorMessage("Por favor ingresa un número de teléfono válido.");
      return;
    }
    if (cleanNumber.length < 6) {
      setErrorMessage("El número de teléfono debe tener al menos 6 dígitos.");
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    setHasSearched(true);

    try {
      const fullPhone = `${countryCode}${cleanNumber}`;
      const res = await fetch(
        `${API_URL}/public/${slug}/reservations?phone=${encodeURIComponent(fullPhone)}`,
      );

      if (!res.ok) {
        throw new Error("No se pudo obtener la información de turnos.");
      }

      const data = await res.json();
      setReservations(Array.isArray(data) ? data : []);
    } catch {
      setErrorMessage(
        "Ocurrió un error al buscar tus turnos. Por favor intenta de nuevo.",
      );
      setReservations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setPhoneNumber("");
    setHasSearched(false);
    setReservations([]);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] z-10 border border-slate-100 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B3F64]/10 text-[#0B3F64]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-neutral-900 leading-tight">
                Consultar mis turnos
              </h2>
              <p className="text-[12px] font-medium text-slate-500">
                {businessName || "Búsqueda de turnos reservados"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form area */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white">
          <form onSubmit={handleSearch} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Ingresa tu número de WhatsApp / Teléfono
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <PhoneSelector
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    phoneNumber={phoneNumber}
                    onPhoneNumberChange={(val) => {
                      setPhoneNumber(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !phoneNumber.trim()}
                  className={cn(
                    "flex h-11 items-center justify-center gap-1.5 px-4 rounded-xl text-sm font-semibold text-white transition shadow-sm shrink-0 active:scale-95",
                    isLoading || !phoneNumber.trim()
                      ? "bg-slate-300 cursor-not-allowed text-slate-500"
                      : "bg-[#0B3F64] hover:bg-[#0B3F64]/90 text-white cursor-pointer",
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Buscar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </form>
        </div>

        {/* Content / Results area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-[220px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-[#0B3F64] mb-3" />
              <p className="text-sm font-medium text-slate-600">Buscando tus turnos...</p>
              <p className="text-xs text-slate-400 mt-1">Consultando reservas asociadas a tu teléfono</p>
            </div>
          ) : !hasSearched ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <CalendarDays className="h-7 w-7 text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-neutral-800">
                Consulta tus turnos reservados
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Ingresa el número con el que realizaste la reserva para ver la fecha, hora y estado de tu turno.
              </p>
            </div>
          ) : reservations.length === 0 ? (
            /* No se encontró ningún turno */
            <div className="flex flex-col items-center justify-center py-10 text-center px-4 animate-in fade-in duration-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200 text-amber-600 mb-3">
                <CalendarX2 className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">
                no se encontro ningun turno con este telefono
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 max-w-xs">
                Verifica que el número ingresado coincida exactamente con el que usaste al reservar.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 text-xs font-semibold text-[#0B3F64] hover:underline"
              >
                Intentar con otro número
              </button>
            </div>
          ) : (
            /* Si hay turnos encontrados */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {reservations.length === 1
                    ? "1 turno encontrado"
                    : `${reservations.length} turnos encontrados`}
                </p>
              </div>

              {reservations.map((res) => (
                <div
                  key={res.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hover:border-[#0B3F64]/30 hover:shadow-md transition duration-200"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="font-bold text-[15px] text-neutral-900">
                        {res.item?.name || "Servicio"}
                      </h4>
                      {res.customerName && (
                        <p className="text-xs font-medium text-slate-500 mt-0.5">
                          Para: <span className="text-neutral-800">{res.customerName}</span>
                        </p>
                      )}
                    </div>
                    <StatusBadge status={res.status} />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                    <div className="flex items-center gap-2 text-neutral-800">
                      <CalendarDays className="h-4 w-4 text-[#0B3F64] shrink-0" />
                      <span className="font-semibold">{formatDate(res.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Clock className="h-4 w-4 text-[#0B3F64] shrink-0" />
                      <span>
                        {minutesToTime(res.startMinute)} – {minutesToTime(res.endMinute)}
                        {res.item?.durationMinutes && ` (${res.item.durationMinutes} min)`}
                      </span>
                    </div>
                    {res.item?.price != null && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 font-medium">
                        <span className="text-slate-500">Valor del servicio:</span>
                        <span className="font-bold text-neutral-900">
                          {formatCurrency(res.item.price)}
                        </span>
                      </div>
                    )}
                  </div>

                  {res.note && (
                    <p className="mt-2 text-xs text-slate-500 italic bg-amber-50/60 p-2 rounded-lg border border-amber-100/80">
                      Nota: {res.note}
                    </p>
                  )}

                  <div className="mt-3.5 flex items-center justify-end">
                    <Link
                      href={`/reserva/${res.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#0B3F64] text-white text-xs font-semibold hover:bg-[#0B3F64]/90 transition shadow-sm active:scale-95"
                    >
                      <span>Ver detalle y gestionar</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
