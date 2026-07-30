"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, LoaderCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";

export default function PushInviteCard() {
  const push = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activationBusy = isActivating || push.activationInFlight;
  const userId = push.getUserId();
  const dismissalKey = userId ? `push-invite-dismissed:v1:${userId}` : null;
  const storedDismissal =
    typeof window !== "undefined" &&
    Boolean(dismissalKey && localStorage.getItem(dismissalKey) === "true");

  const dismissPermanently = () => {
    if (dismissalKey) localStorage.setItem(dismissalKey, "true");
    setOpen(false);
    setDismissed(true);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

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
        setOpen(false);
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
    (push.browserSubscriptionExists && push.backendRegistrationEnabled) ||
    !["default", "granted", "error"].includes(push.state) ||
    !push.checkSupport()
  ) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Alertas de nuevas ventas"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3F64] active:scale-95"
      >
        <Bell className="h-5 w-5" />
      </button>

      {open && (
        <button
          type="button"
          aria-label="Cerrar aviso de alertas"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Alertas de nuevas ventas"
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+76px)] z-50 rounded-3xl border border-[#CEE0EC] bg-white p-5 shadow-[0_18px_50px_rgba(18,26,40,0.18)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-80"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[#62748E] transition hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3F64]"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex gap-3 pr-8">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F1F5F9] text-[#0B3F64]">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#121A28]">
                Alertas de nuevas ventas
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#62748E]">
                Recibe una alerta cuando ingrese una venta automática desde tu
                tienda.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={activationBusy || push.loadingAction !== null}
              onClick={() => void activate()}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B3F64] px-4 text-xs font-semibold text-white transition hover:bg-[#082F4B] disabled:opacity-50"
            >
              {activationBusy && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              {activationBusy ? "Activando..." : "Activar alertas"}
            </button>
            <button
              type="button"
              onClick={dismissPermanently}
              className="min-h-10 rounded-xl px-4 text-xs font-semibold text-[#62748E] transition hover:bg-[#F1F5F9]"
            >
              Más tarde
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
