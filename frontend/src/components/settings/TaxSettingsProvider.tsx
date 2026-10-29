"use client";

import { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getToken } from "@/src/lib/auth";
import { getTaxProfile, toggleTaxSettings, type TaxProfile } from "@/src/lib/settings/api";

type TaxSettingsState = {
  taxProfile: TaxProfile | null;
  taxSettingsEnabled: boolean;
  taxSettingsLoading: boolean;
  taxSettingsReady: boolean;
  taxSettingsError: string | null;
  fiscalRevision: number;
  refreshTaxSettings: () => Promise<void>;
  setTaxSettingsEnabled: (enabled: boolean) => Promise<void>;
};

export const TaxSettingsContext = createContext<TaxSettingsState | null>(null);

function subscribeSession(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("auth-session-changed", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("auth-session-changed", listener);
  };
}

export function TaxSettingsProvider({ children }: { children: ReactNode }) {
  // The token identifies both business and login session; it never leaves memory here.
  const session = useSyncExternalStore(subscribeSession, () => getToken() ?? "", () => "");
  return <SessionTaxSettings key={session} session={session}>{children}</SessionTaxSettings>;
}

function SessionTaxSettings({ session, children }: { session: string; children: ReactNode }) {
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const currentSession = useCallback(() => mounted.current && getToken() === session, [session]);

  const refresh = useCallback(async (saved = false) => {
    if (!session || !currentSession()) return;
    const request = ++generation.current;
    setLoading(true);
    setReady(false);
    setError(null);
    setRevision(value => value + 1);
    try {
      const next = await getTaxProfile();
      if (currentSession() && request === generation.current) {
        setProfile(next);
        setReady(true);
      }
    } catch {
      if (currentSession() && request === generation.current) {
        setError(saved
          ? "El cambio fiscal se guardó, pero no se pudo sincronizar esta pantalla. Reintentá la actualización."
          : "No se pudo sincronizar el perfil fiscal. Reintentá la actualización.");
      }
    } finally {
      if (currentSession() && request === generation.current) setLoading(false);
    }
  }, [session, currentSession]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const sync = () => { if (!savingRef.current) void refresh(true); };
    const onFocus = () => { if (!savingRef.current) void refresh(); };
    window.addEventListener("tax-settings-changed", sync);
    window.addEventListener("tax-profile-updated", sync);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener("tax-settings-changed", sync);
      window.removeEventListener("tax-profile-updated", sync);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const toggle = useCallback(async (enabled: boolean) => {
    if (savingRef.current || !currentSession()) return;
    savingRef.current = true;
    ++generation.current;
    setLoading(false);
    setSaving(true);
    setReady(false);
    setError(null);
    setRevision(value => value + 1);
    try {
      const saved = await toggleTaxSettings(enabled);
      if (!currentSession()) return;
      // PATCH returns the scalar profile only. GET supplies responsibilities.
      setProfile(previous => ({ ...saved, responsibilities: previous?.responsibilities ?? [] }));
      await refresh(true);
    } catch {
      if (currentSession()) setError("No se pudo cambiar la configuración fiscal. Reintentá la actualización.");
    } finally {
      savingRef.current = false;
      if (currentSession()) setSaving(false);
    }
  }, [currentSession, refresh]);

  return <TaxSettingsContext.Provider value={{
    taxProfile: profile,
    taxSettingsEnabled: profile?.taxSettingsEnabled === true,
    taxSettingsLoading: loading || saving,
    taxSettingsReady: ready && !saving,
    taxSettingsError: error,
    fiscalRevision: revision,
    refreshTaxSettings: refresh,
    setTaxSettingsEnabled: toggle,
  }}>
    {error && <div role="alert" className="fixed left-4 right-4 top-3 z-[100] rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      {error} <button type="button" disabled={loading || saving} onClick={() => void refresh()} className="underline">Reintentar</button>
    </div>}
    {children}
  </TaxSettingsContext.Provider>;
}
