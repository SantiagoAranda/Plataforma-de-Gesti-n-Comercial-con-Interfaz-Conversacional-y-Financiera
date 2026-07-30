"use client";

import { useState } from "react";
import { Bell, BellOff, Info, LoaderCircle } from "lucide-react";
import toast from "react-hot-toast";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";

const stateCopy = {
  unsupported: {
    label: "No compatible",
    detail: "Este navegador o entorno no permite recibir notificaciones web.",
    color: "text-[#C80237]",
  },
  default: {
    label: "No configurado",
    detail:
      "Activa las notificaciones para recibir alertas en este dispositivo.",
    color: "text-[#62748E]",
  },
  granted: {
    label: "No configurado",
    detail:
      "El permiso existe, pero este dispositivo todavía no está registrado.",
    color: "text-[#62748E]",
  },
  denied: {
    label: "Bloqueado por el navegador",
    detail:
      "Habilita las notificaciones desde la configuración del navegador o sistema.",
    color: "text-[#C80237]",
  },
  registered: {
    label: "Activado",
    detail: "Este dispositivo recibirá alertas de nuevas ventas.",
    color: "text-[#00963D]",
  },
  error: {
    label: "Error temporal",
    detail: "No se pudo completar la operación. Intenta nuevamente.",
    color: "text-[#C80237]",
  },
} as const;

export default function PushSettingsCard() {
  const push = usePushNotifications();
  const [isActivating, setIsActivating] = useState(false);
  const copy = stateCopy[push.state];
  const activationBusy = isActivating || push.activationInFlight;
  const busy = push.loadingAction !== null || activationBusy;

  const activate = async () => {
    if (activationBusy) return;
    setIsActivating(true);
    try {
      const result = await push.activatePush();
      if (result.ok) {
        toast.success("Notificaciones activadas en este dispositivo.");
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsActivating(false);
    }
  };

  const sendTest = async () => {
    try {
      if (await push.sendTestPush()) {
        toast.success("Notificación de prueba enviada.");
      }
    } catch {
      toast.error("No se pudo enviar la notificación de prueba.");
    }
  };

  const deactivate = async () => {
    if (await push.deactivatePush()) {
      toast.success("Notificaciones desactivadas en este dispositivo.");
    } else {
      toast.error("No se pudo desactivar completamente este dispositivo.");
    }
  };

  const togglePreference = async (enabled: boolean) => {
    if (!(await push.setBusinessPreference(enabled))) {
      toast.error("No se pudo actualizar la preferencia del negocio.");
    }
  };

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#CEE0EC] bg-[#E6EFF5] text-[#0B3F64]">
          <Bell className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#121A28]">
            Notificaciones
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#62748E]">
            Recibe alertas cuando ingrese una venta automática desde tu tienda.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-[#F1F5F9] p-4">
        <div>
          <p className="text-xs font-semibold text-[#121A28]">
            Notificar nuevas ventas de la tienda
          </p>
          <p className="mt-1 text-[11px] text-[#62748E]">
            Preferencia general del negocio
          </p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <span className="sr-only">Notificar nuevas ventas de la tienda</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={Boolean(push.status?.notifyOnAutomaticSale)}
            disabled={!push.status || push.loadingAction === "preference"}
            onChange={(event) => void togglePreference(event.target.checked)}
          />
          <span className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#0B3F64] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#0B3F64] peer-disabled:opacity-50" />
        </label>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-[#121A28]">Este dispositivo</p>
        <div
          className="mt-2 flex items-start gap-2"
          role="status"
          aria-live="polite"
        >
          {push.state === "registered" ? (
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#00963D]" />
          ) : (
            <BellOff className={`mt-0.5 h-4 w-4 shrink-0 ${copy.color}`} />
          )}
          <div>
            <p className={`text-xs font-semibold ${copy.color}`}>
              {copy.label}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[#62748E]">
              {push.activationError?.message ?? copy.detail}
            </p>
          </div>
        </div>
      </div>

      {(push.needsIosInstall || push.state === "denied") && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-[11px] leading-5 text-[#C80237]">
          <div className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {push.needsIosInstall
                ? "En iPhone, abre la plataforma en Safari, pulsa Compartir, selecciona “Añadir a pantalla de inicio”, abre la app instalada y vuelve a esta sección."
                : "Abre la configuración del sitio en tu navegador y habilita Notificaciones. En Windows o Android, verifica también los permisos del sistema."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {push.state !== "registered" && push.state !== "denied" && (
          <button
            type="button"
            disabled={busy || push.state === "unsupported"}
            onClick={() => void activate()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B3F64] px-4 text-xs font-semibold text-white transition hover:bg-[#082F4B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activationBusy && (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            )}
            {activationBusy ? "Activando..." : "Activar notificaciones"}
          </button>
        )}
        {push.state === "registered" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendTest()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B3F64] px-4 text-xs font-semibold text-white transition hover:bg-[#082F4B] disabled:opacity-50"
            >
              {push.loadingAction === "test" && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              {push.loadingAction === "test" ? "Enviando..." : "Enviar prueba"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void deactivate()}
              className="min-h-11 rounded-xl px-4 text-xs font-semibold text-[#62748E] transition hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              {push.loadingAction === "deactivate"
                ? "Desactivando..."
                : "Desactivar en este dispositivo"}
            </button>
          </>
        )}
      </div>

      {push.status && (
        <p className="mt-4 text-[10px] text-[#62748E]">
          Dispositivos activos del negocio: {push.status.registeredDeviceCount}
        </p>
      )}
    </section>
  );
}
