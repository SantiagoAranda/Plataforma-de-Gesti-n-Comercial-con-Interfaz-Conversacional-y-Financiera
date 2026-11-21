"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Eye, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { signedDeliveryApi, type SignedDelivery, type SignedDeliveryApi } from "@/src/services/signedDelivery";

const MAX_BYTES = 10 * 1024 * 1024;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Copia firmada de la orden de entrega: adjuntar, ver, reemplazar y quitar. Solo la ve el negocio. */
export default function SignedDeliveryPanel({
  orderId,
  service = signedDeliveryApi,
}: {
  orderId: string;
  service?: SignedDeliveryApi;
}) {
  const [state, setState] = useState<SignedDelivery | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    service
      .get(orderId)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ attached: false }));
    return () => {
      alive = false;
    };
  }, [orderId, service]);

  const run = useCallback(async (job: () => Promise<SignedDelivery | void>, fail: string) => {
    setBusy(true);
    try {
      const next = await job();
      if (next) setState(next);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : fail);
    } finally {
      setBusy(false);
    }
  }, []);

  const onFile = (file?: File) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) return void toast.error("El archivo no puede superar los 10 MB");
    void run(async () => {
      const next = await service.upload(orderId, file);
      toast.success("Copia firmada guardada");
      return next;
    }, "No se pudo guardar la copia firmada");
  };

  const open = () =>
    void run(async () => {
      const url = URL.createObjectURL(await service.file(orderId));
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, "No se pudo abrir la copia firmada");

  const remove = () => {
    if (!window.confirm("¿Quitar la copia firmada? Esta acción no se puede deshacer.")) return;
    void run(async () => {
      const next = await service.remove(orderId);
      toast.success("Copia firmada eliminada");
      return next;
    }, "No se pudo quitar la copia firmada");
  };

  if (!state) return <p className="mt-3 text-xs text-slate-400">Cargando copia firmada…</p>;

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <section aria-label="Copia firmada" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-slate-800">Copia firmada</p>
        <p className="text-slate-500">
          {state.attached
            ? `${state.mimeType === "application/pdf" ? "PDF" : "Foto"} · ${kb(state.sizeBytes)}`
            : "Aún no adjuntas la orden firmada por el cliente."}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label="Archivo de la copia firmada"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {state.attached && (
        <>
          <button type="button" className={btn} disabled={busy} onClick={open}>
            <Eye size={14} /> Ver
          </button>
          <button type="button" className={`${btn} text-rose-600`} disabled={busy} onClick={remove}>
            <Trash2 size={14} /> Quitar
          </button>
        </>
      )}
      <button type="button" className={btn} disabled={busy} onClick={() => input.current?.click()}>
        <Camera size={14} /> {state.attached ? "Reemplazar" : "Adjuntar"}
      </button>
    </section>
  );
}
