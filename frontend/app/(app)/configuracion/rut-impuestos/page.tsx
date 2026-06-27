"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Landmark } from "lucide-react";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import {
  getTaxProfile,
  updateTaxProfile,
  listTaxResponsibilities,
  searchCiiu,
  listIcaRates,
  createIcaRate,
  updateIcaRate,
  TaxResponsibility,
  CiiuActivity,
  IcaRate,
} from "@/src/lib/settings/api";
import {
  COLOMBIAN_MUNICIPALITIES,
  getDepartmentCodeFromMunicipality,
  getMunicipalityName,
} from "@/src/constants/colombianMunicipalities";

const RUT_VISIBLE_RESPONSIBILITY_CODES = ["05", "07", "10", "13", "15", "47", "48", "49", "52"];
const SIMULATOR_RETEICA_PER_THOUSAND = "9.66";

const RESPONSIBILITY_LABELS: Record<string, string> = {
  "05": "Impuesto Renta",
  "07": "Retencion en la Fuente",
  "10": "Obligado Contabilidad",
  "13": "Gran Contribuyente",
  "15": "Autorretenedor",
  "47": "Regimen Simple",
  "48": "Responsable IVA",
  "49": "No Responsable IVA",
  "52": "Facturador Electronico",
};

const inputClassName =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-400";

function DianBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
      {children}
    </span>
  );
}

function decimalToPerThousand(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return SIMULATOR_RETEICA_PER_THOUSAND;
  return (parsed * 1000).toFixed(2).replace(/\.00$/, "");
}

function parsePerThousand(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function RutImpuestosPage() {
  const router = useRouter();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [personType, setPersonType] = useState<"NATURAL" | "JURIDICA">("NATURAL");
  const [documentType, setDocumentType] = useState<"CC" | "NIT" | "CE" | "PASAPORTE" | "TI">("NIT");
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

  const [icaRates, setIcaRates] = useState<IcaRate[]>([]);
  const [icaRateId, setIcaRateId] = useState<string | null>(null);
  const [icaRatePerMil, setIcaRatePerMil] = useState(SIMULATOR_RETEICA_PER_THOUSAND);
  const [useSameReteIcaRate, setUseSameReteIcaRate] = useState(true);
  const [reteIcaRatePerMil, setReteIcaRatePerMil] = useState(SIMULATOR_RETEICA_PER_THOUSAND);
  const [minBaseUvt, setMinBaseUvt] = useState("0");

  useEffect(() => {
    async function loadData() {
      try {
        const [profile, catalog, rates] = await Promise.all([
          getTaxProfile().catch(() => null),
          listTaxResponsibilities().catch(() => []),
          listIcaRates().catch(() => []),
        ]);

        setResponsibilitiesCatalog(catalog);
        setIcaRates(rates);

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

          const configuredRate = rates.find(
            (rate) =>
              rate.municipalityCode === profile.municipalityCode &&
              rate.ciiuCode === profile.mainCiiuCode,
          );
          if (configuredRate) {
            setIcaRateId(configuredRate.id);
            setIcaRatePerMil(decimalToPerThousand(configuredRate.icaRate));
            setReteIcaRatePerMil(decimalToPerThousand(configuredRate.reteIcaRate));
            setUseSameReteIcaRate(
              decimalToPerThousand(configuredRate.icaRate) ===
                decimalToPerThousand(configuredRate.reteIcaRate),
            );
            setMinBaseUvt(String(configuredRate.minBaseUvt ?? "0"));
          }
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
  }, [notify]);

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

  useEffect(() => {
    if (useSameReteIcaRate) setReteIcaRatePerMil(icaRatePerMil);
  }, [icaRatePerMil, useSameReteIcaRate]);

  const selectedMunicipalityName = useMemo(
    () => (municipalityCode ? getMunicipalityName(municipalityCode) : ""),
    [municipalityCode],
  );

  const visibleResponsibilities = responsibilitiesCatalog.filter((responsibility) =>
    RUT_VISIBLE_RESPONSIBILITY_CODES.includes(responsibility.code),
  );



  const handleMunicipalityChange = (code: string) => {
    setMunicipalityCode(code);
    setDepartmentCode(code ? getDepartmentCodeFromMunicipality(code) : "");
  };

  const handleRespChange = (code: string, checked: boolean) => {
    setSelectedRespCodes((prev) => {
      let next = [...prev];

      if (checked) {
        if (code === "48") next = next.filter((currentCode) => currentCode !== "49");
        if (code === "49") next = next.filter((currentCode) => currentCode !== "48");
        if (!next.includes(code)) next.push(code);
      } else {
        next = next.filter((currentCode) => currentCode !== code);
      }

      return next;
    });
  };

  const handleSelectCiiu = (activity: CiiuActivity) => {
    setMainCiiuCode(activity.code);
    setMainCiiuDescription(activity.description);
    setShowCiiuDropdown(false);
    setCiiuSearch("");
  };

  const saveIcaRate = async () => {
    if (!municipalityCode || !mainCiiuCode) return;

    const icaRatePerThousand = parsePerThousand(icaRatePerMil);
    const reteIcaRatePerThousand = parsePerThousand(reteIcaRatePerMil);
    const parsedMinBaseUvt = Number(minBaseUvt.trim().replace(",", "."));

    if (
      icaRatePerThousand === null ||
      reteIcaRatePerThousand === null ||
      icaRatePerThousand < 0 ||
      reteIcaRatePerThousand < 0 ||
      !Number.isFinite(parsedMinBaseUvt) ||
      parsedMinBaseUvt < 0
    ) {
      throw new Error("Ingrese tarifas ICA/ReteICA validas en por mil.");
    }

    const payload = {
      municipalityCode,
      ciiuCode: mainCiiuCode.trim(),
      activityName: mainCiiuDescription.trim() || null,
      icaRatePerThousand,
      reteIcaRatePerThousand,
      minBaseUvt: parsedMinBaseUvt,
    };

    const existing =
      icaRateId ||
      icaRates.find(
        (rate) =>
          rate.municipalityCode === payload.municipalityCode &&
          rate.ciiuCode === payload.ciiuCode,
      )?.id;

    const saved = existing
      ? await updateIcaRate(existing, payload)
      : await createIcaRate(payload);

    setIcaRateId(saved.id);
    setIcaRates((prev) => {
      const withoutCurrent = prev.filter((rate) => rate.id !== saved.id);
      return [...withoutCurrent, saved];
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      await updateTaxProfile({
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
      });

      await saveIcaRate();

      notify({
        message: "El perfil fiscal y la configuracion ICA/ReteICA se actualizaron correctamente.",
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">Cargando configuracion fiscal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-10 text-slate-950">
      <header className="mx-auto flex max-w-3xl items-center px-4 pb-5 pt-5">
        <button
          type="button"
          onClick={() => router.push("/configuracion")}
          aria-label="Volver a configuracion"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 pr-10 text-center">
          <h1 className="text-xl font-extrabold tracking-tight">RUT e Impuestos</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">
            Datos fiscales, responsabilidades e ICA/ReteICA
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        <form onSubmit={handleSave} className="space-y-5">
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-bold">Datos basicos del RUT</h2>
              <p className="mt-1 text-xs text-slate-500">
                Estos datos se usan para calcular impuestos y completar informacion del negocio.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Tipo persona</span>
                <select
                  value={personType}
                  onChange={(event) => setPersonType(event.target.value as "NATURAL" | "JURIDICA")}
                  className={inputClassName}
                >
                  <option value="NATURAL">Persona Natural</option>
                  <option value="JURIDICA">Persona Juridica</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Tipo documento</span>
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as any)}
                  className={inputClassName}
                >
                  <option value="NIT">31 - NIT</option>
                  <option value="CC">13 - Cedula de Ciudadania</option>
                  <option value="CE">22 - Cedula de Extranjeria</option>
                  <option value="PASAPORTE">41 - Pasaporte</option>
                  <option value="TI">12 - Tarjeta de Identidad</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>05</DianBadge>
                  NIT / documento fiscal
                </span>
                <input
                  type="text"
                  required
                  value={nit}
                  onChange={(event) => setNit(event.target.value)}
                  placeholder="Documento fiscal / NIT"
                  className={inputClassName}
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>06</DianBadge>
                  DV
                </span>
                <input
                  type="text"
                  maxLength={1}
                  value={dv}
                  onChange={(event) => setDv(event.target.value)}
                  placeholder="DV"
                  className={`${inputClassName} px-2 text-center font-semibold`}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>35</DianBadge>
                  Razon social / nombre
                </span>
                <input
                  type="text"
                  required
                  value={tradeName}
                  onChange={(event) => setTradeName(event.target.value)}
                  placeholder="Nombre / razon social"
                  className={inputClassName}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Correo RUT</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Correo"
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Telefono / WhatsApp</span>
                <input
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Telefono"
                  className={inputClassName}
                />
              </label>

              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>41</DianBadge>
                  Municipio fiscal
                </span>
                <select
                  required
                  value={municipalityCode}
                  onChange={(event) => handleMunicipalityChange(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Seleccionar municipio</option>
                  {COLOMBIAN_MUNICIPALITIES.map((municipality) => (
                    <option key={municipality.code} value={municipality.code}>
                      {municipality.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)]">
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>40</DianBadge>
                  Depto
                </span>
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
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <DianBadge>42</DianBadge>
                  Direccion
                </span>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Direccion"
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="relative space-y-2">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <DianBadge>46</DianBadge>
                Actividad economica / CIIU
              </h3>
              <input
                type="text"
                value={ciiuSearch}
                onChange={(event) => {
                  setCiiuSearch(event.target.value);
                  setShowCiiuDropdown(true);
                }}
                placeholder={
                  mainCiiuCode
                    ? `${mainCiiuCode} - ${mainCiiuDescription || "Actividad seleccionada"}`
                    : "Seleccionar actividad..."
                }
                className={inputClassName}
              />

              {showCiiuDropdown && ciiuResults.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
                  {ciiuResults.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => handleSelectCiiu(activity)}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-xs text-slate-600 transition hover:bg-slate-50"
                    >
                      <strong className="text-slate-900">{activity.code}</strong> -{" "}
                      {activity.description}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-800">Responsabilidades</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleResponsibilities.map((responsibility) => {
                  const selected = selectedRespCodes.includes(responsibility.code);

                  return (
                    <label
                      key={responsibility.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-800 hover:border-blue-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => handleRespChange(responsibility.code, event.target.checked)}
                        className="sr-only"
                      />
                      <span
                        className={`inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          selected ? "bg-blue-400/70 text-white" : "bg-slate-100 text-slate-600"
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
          </section>

          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Landmark className="h-4 w-4 text-slate-600" />
                ICA / ReteICA
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                ICA/ReteICA depende del municipio y actividad economica.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Municipio fiscal usado:</span>{" "}
                {selectedMunicipalityName || "No disponible"}
                {municipalityCode ? ` (${municipalityCode})` : ""} - tomado de Datos basicos.
              </p>
              <p>
                <span className="font-semibold text-slate-800">Actividad usada:</span>{" "}
                {mainCiiuCode
                  ? `CIIU ${mainCiiuCode}${mainCiiuDescription ? ` - ${mainCiiuDescription}` : ""}`
                  : "No disponible"}{" "}
                - tomada de Datos basicos.
              </p>
              <p className="text-slate-400">
                Para cambiar municipio o actividad, edita Datos basicos del RUT.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Tarifa ICA</span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={icaRatePerMil}
                    onChange={(event) => setIcaRatePerMil(event.target.value)}
                    className={`${inputClassName} pr-9`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    â€°
                  </span>
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-600">Tarifa ReteICA</span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={reteIcaRatePerMil}
                    disabled={useSameReteIcaRate}
                    onChange={(event) => setReteIcaRatePerMil(event.target.value)}
                    className={`${inputClassName} pr-9 disabled:text-slate-400`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    â€°
                  </span>
                </div>
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={useSameReteIcaRate}
                onChange={(event) => setUseSameReteIcaRate(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Usar misma tarifa ICA para ReteICA
            </label>

            <details className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-600">
                Opciones avanzadas
              </summary>
              <label className="mt-3 block space-y-2">
                <span className="text-xs font-semibold text-slate-600">
                  Base minima ReteICA UVT
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minBaseUvt}
                  onChange={(event) => setMinBaseUvt(event.target.value)}
                  className={inputClassName}
                />
              </label>
            </details>
          </section>


          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-full bg-blue-600 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </main>
    </div>
  );
}
