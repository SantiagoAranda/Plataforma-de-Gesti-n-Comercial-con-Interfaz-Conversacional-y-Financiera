"use client";

import { useState } from "react";
import { Bell, LoaderCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";

export default function PushInviteCard() {
  const push = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const activationBusy = isActivating || push.activationInFlight;
  const userId = push.getUserId();
  const dismissalKey = userId ? `push-invite-dismissed:v1:${userId}` : null;
  const storedDismissal =
    typeof window !== "undefined" &&
    Boolean(dismissalKey && localStorage.getItem(dismissalKey) === "true");

  const dismiss = () => {
    if (dismissalKey) localStorage.setItem(dismissalKey, "true");
    setDismissed(true);
  };

  const activate = async () => {
    if (activationBusy) return;
    setIsActivating(true);
    try {
      const result = await push.activatePush();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      if (await push.setBusinessPreference(true)) {
        toast.success("Alertas de nuevas ventas activadas.");
      } else {
        toast.error(
          "El dispositivo quedó registrado, pero falta activar la preferencia del negocio.",
        );
      }
    } finally {
      setIsActivating(false);
    }
  };

  if (
    dismissed ||
    storedDismissal ||
    !push.status ||
    push.status.enabled ||
    !["default", "granted", "error"].includes(push.state) ||
    !push.supported
  ) {
    return null;
  }

  return (
    <section className="relative rounded-3xl border border-[#CEE0EC] bg-[#F1F5F9] p-4 shadow-sm">
      <button
        type="button"
        aria-label="Cerrar invitación"
        onClick={dismiss}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[#62748E] hover:bg-white"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex gap-3 pr-8">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#0B3F64]">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#121A28]">
            Alertas de nuevas ventas
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#62748E]">
            Activar alertas registrará este dispositivo y habilitará la
            preferencia del negocio.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={activationBusy || push.loadingAction !== null}
          onClick={() => void activate()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0B3F64] px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {activationBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {activationBusy ? "Activando..." : "Activar alertas"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-10 rounded-xl px-4 text-xs font-semibold text-[#62748E] hover:bg-white"
        >
          Más tarde
        </button>
      </div>
    </section>
  );
}
