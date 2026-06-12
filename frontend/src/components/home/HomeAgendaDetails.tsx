"use client";

import { X } from "lucide-react";

import { cn } from "@/src/lib/utils";
import type { AgendaEvent, AgendaEventStatus } from "@/src/lib/agenda/events";

function formatTimeLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function getInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "•";
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

export function HomeAgendaDetailsContent({
  date,
  events,
}: {
  date: Date;
  events: AgendaEvent[];
}) {
  const dateLabel = date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="h-full overflow-y-auto px-5 pb-6">
      <div className="pt-5">
        <div className="text-lg font-semibold text-neutral-900">
          Programación Detallada
        </div>
        <div className="mt-1 text-sm text-neutral-500 capitalize">
          {dateLabel}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-2xl border border-black/5 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                  {getInitial(ev.customerName)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{ev.customerName}</div>
                  <div className="text-sm text-neutral-500 truncate">
                    {ev.description}
                  </div>
                </div>
              </div>

              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
                  statusBadgeStyle(ev.status),
                )}
              >
                {ev.status}
              </span>
            </div>

            <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Horario</span>
                <span className="font-medium">{formatTimeLabel(ev.scheduledAt)}</span>
              </div>

              {!!ev.location && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-neutral-500">Ubicación</span>
                  <span className="font-medium">{ev.location}</span>
                </div>
              )}

              {typeof ev.amount === "number" && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-neutral-500">Monto</span>
                  <span className="font-medium">
                    {ev.amount.toLocaleString("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              )}

              {!!ev.reference && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-neutral-500">Ref.</span>
                  <span className="font-medium">{ev.reference}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                disabled
                className="h-10 flex-1 rounded-full bg-neutral-100 text-sm font-semibold text-neutral-400"
              >
                Conciliar
              </button>
              <button
                disabled
                className="h-10 flex-1 rounded-full bg-neutral-100 text-sm font-semibold text-neutral-400"
              >
                Reportar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeAgendaDetailsDrawer({
  open,
  date,
  events,
  onClose,
}: {
  open: boolean;
  date: Date;
  events: AgendaEvent[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md">
        <div className="relative h-[92vh] rounded-t-3xl bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
          <div className="flex items-start justify-between px-5 pb-3 pt-5">
            <div>
              <div className="text-lg font-semibold text-neutral-900">
                Programación Detallada
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <HomeAgendaDetailsContent date={date} events={events} />
        </div>
      </div>
    </div>
  );
}

