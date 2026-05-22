"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Building2,
  ImageIcon,
  Loader2,
  Phone,
  Save,
  Trash2,
  Upload,
  UserCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import AppHeader from "@/src/components/layout/AppHeader";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  BUSINESS_LOGO_ACCEPT,
  BusinessLogoProfile,
  deleteBusinessLogo,
  getBusinessProfile,
  readBusinessLogoFileError,
  uploadBusinessLogo,
} from "@/src/lib/businessLogo";
import { readBusinessProfile, writeBusinessProfile } from "@/src/lib/businessProfile";

export default function PerfilPage() {
  const router = useRouter();
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState<BusinessLogoProfile | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const profile = readBusinessProfile();
    setName(profile.name || "Mi Negocio");
    setSubtitle(profile.subtitle || "");
    setPhone(profile.phone || "");

    let cancelled = false;

    getBusinessProfile()
      .then((businessProfile) => {
        if (cancelled) return;
        setBusiness(businessProfile);
        setName(businessProfile.name || profile.name || "Mi Negocio");
        setPhone(businessProfile.phoneWhatsapp || profile.phone || "");
      })
      .catch((error) => {
        console.error("Error cargando perfil del negocio", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = (business?.name || name || "Mi Negocio")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const handleSave = () => {
    writeBusinessProfile({
      name: name.trim(),
      subtitle: subtitle.trim(),
      phone: phone.trim(),
    });

    // TODO: Persistir en backend cuando exista endpoint de perfil/negocio.
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const fileError = readBusinessLogoFileError(file);
    if (fileError) {
      setLogoError(fileError);
      notify({ type: "error", message: fileError });
      return;
    }

    setLogoBusy(true);
    setLogoError(null);

    try {
      const updated = await uploadBusinessLogo(file);
      setBusiness(updated);
      notify({ type: "success", message: "Logo actualizado" });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "No se pudo subir el logo";
      setLogoError(message);
      notify({ type: "error", message });
    } finally {
      setLogoBusy(false);
    }
  };

  const handleDeleteLogo = async () => {
    setLogoBusy(true);
    setLogoError(null);

    try {
      const updated = await deleteBusinessLogo();
      setBusiness(updated);
      notify({ type: "success", message: "Logo eliminado" });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "No se pudo eliminar el logo";
      setLogoError(message);
      notify({ type: "error", message });
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader title="Perfil" subtitle="Datos del negocio" showBack hrefBack="/home" />

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <div className="flex justify-center pt-6 pb-2">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-1 ring-black/5">
              {business?.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={`Logo de ${business.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserCircle2 className="h-16 w-16 text-neutral-400" />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 text-slate-500">
                {business?.logoUrl ? (
                  <img
                    src={business.logoUrl}
                    alt={`Logo de ${business.name}`}
                    className="h-full w-full object-cover"
                  />
                ) : initials ? (
                  <span className="text-xl font-bold text-slate-500">{initials}</span>
                ) : (
                  <ImageIcon className="h-8 w-8" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  Logo de empresa
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  JPG, PNG o WEBP hasta 2 MB. Se optimiza antes de guardarlo.
                </p>
                {logoError && (
                  <p className="mt-2 text-xs font-semibold text-red-500">
                    {logoError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={BUSINESS_LOGO_ACCEPT}
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  disabled={logoBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {logoBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Cambiar logo
                </button>
                {business?.logoUrl && (
                  <button
                    type="button"
                    disabled={logoBusy}
                    onClick={handleDeleteLogo}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <Building2 className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">
                  Empresa
                </p>
                <p className="text-xs font-medium text-neutral-500">
                  Editá el nombre y el subtítulo que se verá en Home y Tienda.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  Nombre
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre de la empresa"
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  Subtítulo
                </label>
                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Descripción corta (opcional)"
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                <Phone className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">
                  Teléfono
                </p>
                <p className="text-xs font-medium text-neutral-500">
                  Guardá un teléfono de contacto para WhatsApp / Tienda.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                Número
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: +54 11 1234-5678"
                inputMode="tel"
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="rounded-2xl px-4 py-3 text-sm font-semibold text-neutral-600 hover:bg-black/5"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99]"
            >
              <Save className="h-4 w-4" />
              {saved ? "Guardado" : "Guardar"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
