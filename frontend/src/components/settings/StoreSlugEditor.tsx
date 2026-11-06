"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import BusinessSlugField, { customSlugError } from "../auth/BusinessSlugField";
import { AppApiError } from "../../lib/api";
import { StaleSessionError } from "../../lib/auth/session";
import { updateBusinessSlug, type BusinessLogoProfile } from "../../lib/businessLogo";

export const SLUG_CHANGE_NOTICE =
  "Podés modificar la dirección pública de tu tienda una sola vez. Tu enlace anterior seguirá funcionando y redirigirá automáticamente al nuevo.";

type Props = { business: BusinessLogoProfile | null; onChange(profile: BusinessLogoProfile): void };

export default function StoreSlugEditor({ business, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string>();

  if (!business) return <p className="mt-4 text-sm text-neutral-500">Cargando dirección…</p>;
  const url = `${window.location.origin}/tienda/${encodeURIComponent(business.slug)}`;
  const close = () => { setEditing(false); setConfirming(false); setSlug(""); setError(undefined); };

  const save = async () => {
    setSaving(true);
    try {
      const profile = await updateBusinessSlug(slug);
      onChange(profile);
      close();
      toast.success("Dirección de la tienda actualizada");
    } catch (failure) {
      if (failure instanceof StaleSessionError) return;
      setConfirming(false);
      setError(failure instanceof AppApiError ? failure.message : "No pudimos guardar la dirección. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const button = "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div className="mt-4 space-y-3 text-sm">
      <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
        <p className="text-xs text-neutral-500">Dirección actual</p>
        <a href={url} target="_blank" rel="noreferrer" className="font-medium text-[#0b3f64] break-all hover:underline">{url}</a>
      </div>

      {business.slugChangedAt ? (
        <p className="text-xs text-neutral-500">Ya utilizaste el cambio de dirección de tu tienda.</p>
      ) : !editing ? (
        <button type="button" onClick={() => setEditing(true)} className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
          Cambiar dirección
        </button>
      ) : (
        <div className="space-y-3">
          <BusinessSlugField editOnly name="" custom slug={slug} disabled={saving || confirming} error={error}
            onModeChange={() => undefined} onSlugChange={value => { setSlug(value); setError(undefined); }} />
          {confirming ? (
            <div role="alertdialog" aria-labelledby="slug-change-notice" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p id="slug-change-notice" className="text-sm text-amber-900">{SLUG_CHANGE_NOTICE}</p>
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={save} className={`${button} flex-1 bg-slate-900 text-white hover:bg-slate-800`}>
                  {saving ? "Guardando…" : "Confirmar cambio"}
                </button>
                <button type="button" disabled={saving} onClick={() => setConfirming(false)} className={`${button} flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50`}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={!!customSlugError(slug)} onClick={() => setConfirming(true)} className={`${button} flex-1 bg-slate-900 text-white hover:bg-slate-800`}>
                Guardar dirección
              </button>
              <button type="button" onClick={close} className={`${button} flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50`}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
