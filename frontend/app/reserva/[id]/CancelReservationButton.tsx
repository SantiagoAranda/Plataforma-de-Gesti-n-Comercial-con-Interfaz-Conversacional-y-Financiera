"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface CancelReservationButtonProps {
  reservationId: string;
}

export default function CancelReservationButton({
  reservationId,
}: CancelReservationButtonProps) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "loading" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    setStep("loading");
    setErrorMsg(null);

    try {
      const res = await fetch(
        `${API_URL}/public/reservations/${reservationId}/cancel`,
        { method: "POST" }
      );

      if (!res.ok) {
        throw new Error("No se pudo cancelar la reserva. Intenta nuevamente.");
      }

      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado."
      );
      setStep("error");
    }
  }

  // ── Idle state: primary cancel button ──────────────────────────────────────
  if (step === "idle") {
    return (
      <button
        id="cancel-reservation-btn"
        onClick={() => setStep("confirm")}
        className="mt-3 flex w-full items-center justify-center rounded-xl border border-rose-200 bg-white py-2.5 text-sm font-medium text-rose-600 transition active:scale-[0.98]"
        aria-label="Cancelar reserva"
      >
        Cancelar Reserva
      </button>
    );
  }

  // ── Confirm state: inline confirmation panel ────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-rose-100 bg-rose-50">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-rose-700">
              ¿Confirmas la cancelación?
            </p>
            <p className="mt-0.5 text-[12px] font-normal leading-relaxed text-rose-500">
              Esta acción no se puede deshacer. El turno quedará libre.
            </p>
          </div>
          <button
            onClick={() => setStep("idle")}
            className="flex-shrink-0 text-rose-300 hover:text-rose-500 transition"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 border-t border-rose-100 px-4 py-3">
          <button
            onClick={() => setStep("idle")}
            className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[13px] font-medium text-slate-600 transition active:scale-[0.98]"
          >
            No, volver
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg border border-rose-200 bg-white py-2 text-[13px] font-medium text-rose-600 transition active:scale-[0.98]"
          >
            Sí, cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
        <span className="text-[13px] font-medium text-rose-500">
          Cancelando turno…
        </span>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-rose-100 bg-rose-50 px-4 py-3.5">
      <p className="text-[13px] font-medium text-rose-700">
        Algo salió mal
      </p>
      <p className="mt-0.5 text-[12px] font-normal text-rose-500">
        {errorMsg}
      </p>
      <button
        onClick={() => setStep("idle")}
        className="mt-3 w-full rounded-lg border border-rose-200 bg-white py-2 text-[13px] font-medium text-rose-600 transition active:scale-[0.98]"
      >
        Reintentar
      </button>
    </div>
  );
}
