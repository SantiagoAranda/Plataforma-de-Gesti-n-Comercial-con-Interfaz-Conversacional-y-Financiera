"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api, AppApiError } from "../../lib/api";

export function customSlugError(slug: string): string | undefined {
  if (slug.length < 3 || slug.length > 50 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return "Usá de 3 a 50 letras minúsculas, números y guiones intermedios sin repetir.";
  }
}

type Props = {
  name: string; custom: boolean; slug: string; disabled: boolean; error?: string;
  onModeChange(custom: boolean): void; onSlugChange(slug: string): void;
  /** Profile change: custom identifier only, without the registration legend and mode selector. */
  editOnly?: boolean;
};
type Availability = { slug: string; available: boolean };

export default function BusinessSlugField(props: Props) {
  const { name, custom, slug, disabled, error, onModeChange, onSlugChange, editOnly } = props;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value?: Availability; error?: string }>();
  const key = JSON.stringify([custom, custom ? slug : name, attempt]);
  const syntaxError = custom ? customSlugError(slug) : undefined;
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    if (disabled || (custom ? !!customSlugError(slug) : !name.trim())) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams(custom ? { slug } : { name });
      api<Availability>(`/auth/business-slug-availability?${query}`, {
        auth: false, signal: controller.signal,
      }).then(value => {
        if (active) setResult({ key, value });
      }).catch(failure => {
        if (active) setResult({ key, error: failure instanceof AppApiError && failure.status === 400
          ? failure.message : "No pudimos comprobar la disponibilidad." });
      });
    }, 400);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key, custom, slug, name, disabled]);

  const message = error || (slug && syntaxError) || current?.error;
  const preview = custom ? slug : current?.value?.slug;
  const queried = custom ? !syntaxError : !!name.trim();
  const segment = "flex flex-1 min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors text-neutral-600 has-[:checked]:bg-blue-50 has-[:checked]:text-[#0b3f64] has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0b3f64]/40";
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 text-sm text-neutral-700">
    {!editOnly && <legend className="block text-sm font-medium text-gray-700 mb-2">Dirección de tu tienda pública</legend>}
    {!editOnly && <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
      <label className={segment}>
        <input type="radio" name="slug-mode" checked={!custom} onChange={() => onModeChange(false)} className="accent-[#0b3f64]" />
        <span className="truncate">Automático</span>
      </label>
      <label className={segment}>
        <input type="radio" name="slug-mode" checked={custom} onChange={() => onModeChange(true)} className="accent-[#0b3f64]" />
        <span className="truncate">Personalizado</span>
      </label>
    </div>}
    {custom ? <div className="space-y-1">
      <label htmlFor="register-slug" className="block font-medium text-gray-700">{editOnly ? "Nuevo identificador" : "Identificador"}</label>
      <input id="register-slug" value={slug} onChange={e => onSlugChange(e.target.value)}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!message}
        aria-describedby="register-slug-status" placeholder="prueba-03"
        className="w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#0b3f64]/30" />
      {!message && <p className="text-xs text-neutral-500">Solo minúsculas, números y guiones</p>}
    </div> : <p className="text-xs text-neutral-500">Generaremos una dirección a partir del nombre del negocio.</p>}
    <div className="rounded-xl bg-neutral-50 px-3 py-2.5 space-y-0.5">
      <div id="register-slug-status" aria-live="polite" className="flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-500">Vista previa</span>
        {!message && (current?.value ? (current.value.available
          ? <span className="flex items-center gap-1 font-medium text-green-700"><CheckCircle2 aria-hidden className="h-3.5 w-3.5" />Disponible</span>
          : <span className="font-medium text-red-600">Ocupado</span>)
          : queried && <span className="flex items-center gap-1 text-neutral-500"><Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />Verificando…</span>)}
      </div>
      <p className={`font-medium break-all ${preview ? "text-neutral-900" : "text-neutral-400"}`}>/tienda/{preview || "…"}</p>
      {message && <p className="text-xs text-red-600">{message}{current?.error && <> <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline text-[#0b3f64]">Reintentar</button></>}</p>}
    </div>
  </fieldset>;
}
