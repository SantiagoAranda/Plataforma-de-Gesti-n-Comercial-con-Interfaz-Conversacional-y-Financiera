import { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  User,
  Phone,
  Scissors,
  MessageCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

interface ReservationDetail {
  id: string;
  status: ReservationStatus;
  customerName: string | null;
  customerWhatsapp: string | null;
  date: string; // ISO string
  startMinute: number;
  endMinute: number;
  note: string | null;
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
  // Optional: specialist/employee assigned. Extend when backend supports it.
  specialist?: string | null;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function getReservation(id: string): Promise<ReservationDetail | null> {
  try {
    const res = await fetch(`${API_URL}/public/reservations/${id}`, {
      // No cache for real-time confirmation status
      cache: "no-store",
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    return data as ReservationDetail;
  } catch {
    return null;
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    return {
      title: "Reserva no encontrada",
      description: "No se pudo localizar la información de esta reserva.",
    };
  }

  return {
    title: `Tu Reserva – ${reservation.business.name}`,
    description: `Detalle de tu turno confirmado en ${reservation.business.name}.`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace("COP", "$")
    .replace(/\s+/g, "");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReservationStatus }) {
  const isConfirmed = status === "CONFIRMED";
  const isPending = status === "PENDING";

  if (isConfirmed) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600"
        aria-label="Estado: Confirmado"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Confirmado
      </span>
    );
  }

  if (isPending) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600"
        aria-label="Estado: Pendiente"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Pendiente
      </span>
    );
  }

  // CANCELLED
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600"
      aria-label="Estado: Cancelado"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
      Cancelado
    </span>
  );
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
          {label}
        </p>
        <div className="mt-0.5 text-[15px] font-medium text-slate-800">
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Not Found State ──────────────────────────────────────────────────────────

function ReservationNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white border border-slate-100">
        <CalendarDays className="h-7 w-7 text-slate-300" />
      </div>
      <h1 className="text-[18px] font-semibold text-slate-800">
        Reserva no encontrada
      </h1>
      <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xs">
        No pudimos encontrar ninguna reserva con este enlace. Puede que haya
        expirado o el enlace no sea válido.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    return <ReservationNotFound />;
  }

  const formattedDate = capitalize(formatDate(reservation.date));
  const timeRange = `${minutesToTime(reservation.startMinute)} – ${minutesToTime(reservation.endMinute)}`;
  const whatsappNumber = reservation.business.phoneWhatsapp.replace(/\D/g, "");
  const whatsappHref = `https://wa.me/${whatsappNumber}`;

  return (
    <div className="min-h-screen bg-slate-50 font-[Poppins,sans-serif]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-100 px-5 pt-10 pb-5">
        <div className="mx-auto w-full max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {reservation.business.name}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold text-slate-950 leading-snug">
            Detalle de tu Reserva
          </h1>
        </div>
      </header>

      {/* ── Main card ──────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-md px-4 py-4 pb-28">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">

          {/* Fila 1 – Estado */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <span className="text-[13px] font-medium text-slate-500">
              Estado del turno
            </span>
            <StatusBadge status={reservation.status} />
          </div>

          {/* Divider section – Info rows */}
          <div className="divide-y divide-slate-100 px-4">

            {/* Fila 2 – Cliente */}
            <InfoRow
              icon={<User className="h-4 w-4" />}
              label="Cliente"
              value={
                <div>
                  <span className="block text-slate-800">
                    {reservation.customerName ?? "—"}
                  </span>
                  {reservation.customerWhatsapp && (
                    <span className="mt-0.5 flex items-center gap-1 text-sm font-normal text-slate-500">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      +{reservation.customerWhatsapp}
                    </span>
                  )}
                </div>
              }
            />

            {/* Fila 3 – Servicio y precio */}
            <InfoRow
              icon={<Scissors className="h-4 w-4" />}
              label="Servicio"
              value={
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-800">{reservation.item.name}</span>
                  <span className="flex-shrink-0 text-[15px] font-semibold text-slate-950">
                    {formatPrice(reservation.item.price)}
                  </span>
                </div>
              }
            />

            {/* Fila 4 – Fecha y hora */}
            <InfoRow
              icon={<CalendarDays className="h-4 w-4" />}
              label="Fecha"
              value={
                <div>
                  <span className="block text-slate-800">{formattedDate}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm font-normal text-slate-500">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    {timeRange}
                  </span>
                </div>
              }
            />

            {/* Fila 5 – Profesional (condicional) */}
            {reservation.specialist && (
              <InfoRow
                icon={<User className="h-4 w-4" />}
                label="Especialista"
                value={<span className="text-slate-800">{reservation.specialist}</span>}
              />
            )}

          </div>

          {/* Nota (si existe) */}
          {reservation.note && (
            <div className="border-t border-slate-100 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Nota
              </p>
              <p className="mt-1 text-sm font-normal text-slate-600 leading-relaxed">
                {reservation.note}
              </p>
            </div>
          )}
        </div>

        {/* ID de reserva */}
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Reserva #{id.slice(0, 8).toUpperCase()}
        </p>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white px-5 py-4 safe-area-inset-bottom">
        <div className="mx-auto w-full max-w-md space-y-3">
          {/* WhatsApp CTA */}
          <a
            id="whatsapp-contact-cta"
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 py-3 text-sm font-medium text-emerald-700 transition active:scale-[0.98]"
            aria-label="Contactar por WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
            Contactar por WhatsApp
          </a>

          {/* Disclaimer */}
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            Si necesitas cancelar o reprogramar, por favor comunícate
            directamente por WhatsApp.
          </p>
        </div>
      </footer>
    </div>
  );
}
