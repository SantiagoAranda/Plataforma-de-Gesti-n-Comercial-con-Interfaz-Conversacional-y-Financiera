"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Landmark, MapPin } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  getTaxProfile,
  updateTaxProfile,
  listTaxResponsibilities,
  searchCiiu,
  TaxResponsibility,
  CiiuActivity,
} from "@/src/lib/settings/api";

const RUT_VISIBLE_RESPONSIBILITY_CODES = ["05", "07", "10", "47", "48", "49", "52"];

const RESPONSIBILITY_LABELS: Record<string, string> = {
  "05": "Impuesto Renta",
  "07": "Retención en la Fuente",
  "10": "Obligado Contabilidad",
  "47": "Régimen Simple",
  "48": "Impuesto a las Ventas (IVA)",
  "49": "No Responsable IVA",
  "52": "Facturador Electrónico",
};

function DianBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-4 min-w-5 items-center justify-center rounded bg-slate-950 px-1.5 text-[9px] font-bold leading-none text-white">
      {children}
    </span>
  );
}

const inputClassName =
  "h-12 w-full rounded-2xl border border-transparent bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50";

export default function RutImpuestosPage() {
  const router = useRouter();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [personType, setPersonType] = useState<"NATURAL" | "JURIDICA">("NATURAL");
  const [documentType, setDocumentType] = useState<"CC" | "NIT" | "CE" | "PASAPORTE" | "TI">(
    "NIT",
  );
  const [nit, setNit] = useState("");
  const [dv, setDv] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [municipalityCode, setMunicipalityCode] = useState("");
  const [address, setAddress] = useState("");
  const [mainCiiuCode, setMainCiiuCode] = useState("");
  const [mainCiiuDescription, setMainCiiuDescription] = useState("");

  const [responsibilitiesCatalog, setResponsibilitiesCatalog] = useState<TaxResponsibility[]>([]);
  const [selectedRespCodes, setSelectedRespCodes] = useState<string[]>([]);

  const [ciiuSearch, setCiiuSearch] = useState("");
  const [ciiuResults, setCiiuResults] = useState<CiiuActivity[]>([]);
  const [showCiiuDropdown, setShowCiiuDropdown] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [profile, catalog] = await Promise.all([
          getTaxProfile().catch(() => null),
          listTaxResponsibilities().catch(() => []),
        ]);

        setResponsibilitiesCatalog(catalog);

        if (profile) {
          setPersonType(profile.personType);
          setDocumentType(profile.documentType);
          setNit(profile.nit);
          setDv(profile.dv || "");
          setTradeName(profile.tradeName);
          setEmail(profile.email);
          setPhone(profile.phone);
          setDepartmentCode(profile.departmentCode);
          setMunicipalityCode(profile.municipalityCode);
          setAddress(profile.address);
          setMainCiiuCode(profile.mainCiiuCode || "");
          setMainCiiuDescription(profile.mainCiiuDescription || "");
          setSelectedRespCodes(profile.responsibilities.map((r) => r.responsibility.code));
        }
      } catch (err: any) {
        notify({
          message: err.message || "No se pudieron obtener los datos fiscales.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (ciiuSearch.length < 2) {
      setCiiuResults([]);
      return;
    }

    const delay = setTimeout(async () => {
      try {
        const results = await searchCiiu(ciiuSearch);
        setCiiuResults(results);
      } catch (err) {
        console.error("CIIU search error", err);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [ciiuSearch]);

  const handleRespChange = (code: string, checked: boolean) => {
    setSelectedRespCodes((prev) => {
      let next = [...prev];

      if (checked) {
        if (code === "48") {
          next = next.filter((currentCode) => currentCode !== "49");
        } else if (code === "49") {
          next = next.filter((currentCode) => currentCode !== "48");
        }

        if (!next.includes(code)) next.push(code);
      } else {
        next = next.filter((currentCode) => currentCode !== code);
      }

      return next;
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        personType,
        documentType,
        nit,
        dv: dv || null,
        tradeName,
        email,
        phone,
        departmentCode,
        municipalityCode,
        address,
        mainCiiuCode: mainCiiuCode || null,
        mainCiiuDescription: mainCiiuDescription || null,
        responsibilityCodes: selectedRespCodes,
      };

      await updateTaxProfile(payload);
      notify({
        message: "El perfil fiscal de RUT e impuestos se ha actualizado correctamente.",
        type: "success",
      });
    } catch (err: any) {
      notify({
        message: err.message || "Verifique los datos ingresados.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const visibleResponsibilities = responsibilitiesCatalog.filter((responsibility) =>
    RUT_VISIBLE_RESPONSIBILITY_CODES.includes(responsibility.code),
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb]">
        <p className="text-sm text-slate-500">Cargando configuración fiscal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] pb-10 text-slate-950">
      <header className="mx-auto flex max-w-lg items-center px-4 pb-5 pt-5">
        <button
          type="button"
          onClick={() => router.push("/configuracion")}
          aria-label="Volver a configuración"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-700 transition hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 pr-10 text-center">
          <h1 className="text-xl font-extrabold tracking-tight">RUT Digital</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">
            Validado con Casillas DIAN
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4">
        <form onSubmit={handleSave} className="space-y-4">
          <section className="space-y-5 rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.035)]">
            <h2 className="text-xs font-bold">Información del Contribuyente</h2>

            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3">
              <label className="space-y-2">
                <DianBadge>05</DianBadge>
                <input
                  type="text"
                  required
                  value={nit}
                  onChange={(event) => setNit(event.target.value)}
                  placeholder="NIT"
                  className={inputClassName}
                />
              </label>

              <label className="space-y-2">
                <DianBadge>06</DianBadge>
                <input
                  type="text"
                  maxLength={1}
                  value={dv}
                  onChange={(event) => setDv(event.target.value)}
                  placeholder="DV"
                  className={`${inputClassName} px-3 text-center font-semibold`}
                />
              </label>
            </div>

            <label className="block">
              <span className="sr-only">Tipo de persona</span>
              <select
                value={personType}
                onChange={(event) =>
                  setPersonType(event.target.value as "NATURAL" | "JURIDICA")
                }
                className={inputClassName}
              >
                <option value="NATURAL">Persona Natural</option>
                <option value="JURIDICA">Persona Jurídica</option>
              </select>
            </label>

            <label className="block space-y-2">
              <DianBadge>24</DianBadge>
              <select
                value={documentType}
                onChange={(event) =>
                  setDocumentType(
                    event.target.value as "CC" | "NIT" | "CE" | "PASAPORTE" | "TI",
                  )
                }
                className={inputClassName}
              >
                <option value="NIT">31 · NIT</option>
                <option value="CC">13 · Cédula de Ciudadanía</option>
                <option value="CE">22 · Cédula de Extranjería</option>
                <option value="PASAPORTE">41 · Pasaporte</option>
                <option value="TI">12 · Tarjeta de Identidad</option>
              </select>
            </label>

            <label className="block space-y-2">
              <DianBadge>35</DianBadge>
              <input
                type="text"
                required
                value={tradeName}
                onChange={(event) => setTradeName(event.target.value)}
                placeholder="Apellidos y nombres, razón social"
                className={inputClassName}
              />
            </label>
          </section>

          <section className="space-y-5 rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.035)]">
            <h2 className="flex items-center gap-2 text-xs font-bold">
              <MapPin className="h-4 w-4 text-slate-600" />
              Ubicación
            </h2>

            <label className="block space-y-2">
              <DianBadge>42</DianBadge>
              <input
                type="text"
                required
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Dirección"
                className={inputClassName}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-2">
                <DianBadge>40</DianBadge>
                <input
                  type="text"
                  required
                  value={departmentCode}
                  onChange={(event) => setDepartmentCode(event.target.value)}
                  placeholder="Depto"
                  className={inputClassName}
                />
              </label>

              <label className="block space-y-2">
                <DianBadge>41</DianBadge>
                <input
                  type="text"
                  required
                  value={municipalityCode}
                  onChange={(event) => setMunicipalityCode(event.target.value)}
                  placeholder="Municipio"
                  className={inputClassName}
                />
              </label>
            </div>

            <label className="block space-y-2">
              <DianBadge>44</DianBadge>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className={inputClassName}
              />
            </label>

            <label className="block space-y-2">
              <DianBadge>43</DianBadge>
              <input
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Teléfono"
                className={inputClassName}
              />
            </label>
          </section>

          <section className="relative space-y-5 rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.035)]">
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-xs font-bold">
                <DianBadge>46</DianBadge>
                Actividad Económica
              </h2>

              <input
                type="text"
                value={ciiuSearch}
                onChange={(event) => {
                  setCiiuSearch(event.target.value);
                  setShowCiiuDropdown(true);
                }}
                placeholder={
                  mainCiiuCode
                    ? `${mainCiiuCode} · ${mainCiiuDescription || "Actividad seleccionada"}`
                    : "Seleccionar actividad..."
                }
                className={inputClassName}
              />

              {showCiiuDropdown && ciiuResults.length > 0 && (
                <div className="absolute left-6 right-6 z-20 mt-1 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
                  {ciiuResults.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => {
                        setMainCiiuCode(activity.code);
                        setMainCiiuDescription(activity.description);
                        setShowCiiuDropdown(false);
                        setCiiuSearch("");
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-xs text-slate-600 transition hover:bg-slate-50"
                    >
                      <strong className="text-slate-900">{activity.code}</strong> ·{" "}
                      {activity.description}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <h2 className="flex items-center gap-2 text-xs font-bold">
                <DianBadge>53</DianBadge>
                Responsabilidades
              </h2>

              <div className="space-y-2">
                {visibleResponsibilities.map((responsibility) => {
                  const selected = selectedRespCodes.includes(responsibility.code);

                  return (
                    <label
                      key={responsibility.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-slate-100 bg-slate-50 text-slate-800 hover:border-blue-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          handleRespChange(responsibility.code, event.target.checked)
                        }
                        className="sr-only"
                      />
                      <span
                        className={`inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          selected ? "bg-blue-400/70 text-white" : "bg-white text-slate-600"
                        }`}
                      >
                        {responsibility.code}
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] font-semibold">
                        {RESPONSIBILITY_LABELS[responsibility.code] || responsibility.name}
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/configuracion/rut-impuestos/ica")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <Landmark className="h-3.5 w-3.5" />
              Configurar tarifas municipales ICA
            </button>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-full bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar Registro"}
          </button>
        </form>
      </main>
    </div>
  );
}
