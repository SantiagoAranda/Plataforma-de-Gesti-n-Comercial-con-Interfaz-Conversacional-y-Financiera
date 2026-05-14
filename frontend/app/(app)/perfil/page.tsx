"use client";

import { useEffect, useState } from "react";
import { Building2, Phone, Save, UserCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import AppHeader from "@/src/components/layout/AppHeader";
import { readBusinessProfile, writeBusinessProfile } from "@/src/lib/businessProfile";

export default function PerfilPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const profile = readBusinessProfile();
    setName(profile.name || "Mi Negocio");
    setSubtitle(profile.subtitle || "");
    setPhone(profile.phone || "");
  }, []);

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

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader title="Perfil" subtitle="Datos del negocio" showBack hrefBack="/home" />

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <div className="flex justify-center pt-6 pb-2">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-1 ring-black/5">
              <UserCircle2 className="h-16 w-16 text-neutral-400" />
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
