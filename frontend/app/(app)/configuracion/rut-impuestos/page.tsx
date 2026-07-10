"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import toast from "react-hot-toast";
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
import { getSimpleTaxConfig, updateSimpleTaxConfig } from "@/src/lib/simple-tax/api";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";

const RUT_VISIBLE_RESPONSIBILITY_CODES = ["05", "07", "10", "47", "48", "49", "52"];
const SIMULATOR_RETEICA_PER_THOUSAND = "9.66";

const RESPONSIBILITY_LABELS: Record<string, string> = {
  "05": "Impuesto Renta",
  "07": "Retención en la Fuente",
  "10": "Obligado Contabilidad",
  "13": "Gran Contribuyente",
  "15": "Autorretenedor",
  "47": "Régimen Simple",
  "48": "Impuesto a las Ventas (IVA)",
  "49": "No Responsable IVA",
  "52": "Facturador Electrónico",
};

const SIMPLE_TAX_GROUPS = [
  {
    code: "1",
    label: "Grupo 1 - Tiendas pequenas, minimercados, micromercados y peluquerias",
  },
  {
    code: "2",
    label: "Grupo 2 - Comercio, industria, servicios tecnicos y demas actividades",
  },
  {
    code: "3",
    label: "Grupo 3 - Servicios profesionales y consultoria",
  },
  {
    code: "4",
    label: "Grupo 4 - Comidas, bebidas y hoteles",
  },
];

type TaxBusinessProfileKey =
  | "PN_NO_RESPONSABLE"
  | "PN_RESPONSABLE"
  | "PERSONA_JURIDICA"
  | "RST"
  | "GRAN_CONTRIBUYENTE"
  | "AUTORRETENEDOR"
  | "ADVANCED";

const BUSINESS_PROFILE_OPTIONS: Array<{
  key: Exclude<TaxBusinessProfileKey, "ADVANCED">;
  label: string;
  codes: string[];
  declarant: boolean;
  personType?: "NATURAL" | "JURIDICA";
}> = [
  {
    key: "PN_NO_RESPONSABLE",
    label: "Persona Natural (No Responsable)",
    codes: ["49"],
    declarant: false,
    personType: "NATURAL",
  },
  {
    key: "PN_RESPONSABLE",
    label: "Persona Natural (Responsable)",
    codes: ["05", "48"],
    declarant: true,
    personType: "NATURAL",
  },
  {
    key: "PERSONA_JURIDICA",
    label: "Persona Jurídica",
    codes: ["05", "48", "07"],
    declarant: true,
    personType: "JURIDICA",
  },
  {
    key: "RST",
    label: "Régimen Simple (RST)",
    codes: ["47"],
    declarant: true,
  },
  {
    key: "GRAN_CONTRIBUYENTE",
    label: "Gran Contribuyente",
    codes: ["13", "05", "48", "07"],
    declarant: true,
    personType: "JURIDICA",
  },
  {
    key: "AUTORRETENEDOR",
    label: "Autorretenedor",
    codes: ["15", "05", "48"],
    declarant: true,
    personType: "JURIDICA",
  },
];

const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:text-slate-400";
const labelClassName =
  "flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-800";
const cardClassName = "rounded-2xl border border-slate-100 bg-white p-4 shadow-sm";

function normalizeCodes(codes: string[]) {
  return [...new Set(codes)].sort();
}

function sameCodeSet(a: string[], b: string[]) {
  const left = normalizeCodes(a);
  const right = normalizeCodes(b);
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

function deriveBusinessProfile(codes: string[]): TaxBusinessProfileKey {
  return (
    BUSINESS_PROFILE_OPTIONS.find((option) => sameCodeSet(option.codes, codes))?.key ??
    "ADVANCED"
  );
}

function deriveDeclarantFromCodes(codes: string[]) {
  const normalized = normalizeCodes(codes);
  if (
    normalized.includes("47") ||
    normalized.includes("13") ||
    normalized.includes("15") ||
    (normalized.includes("05") && normalized.includes("48"))
  ) {
    return true;
  }
  if (normalized.length === 1 && normalized[0] === "49") return false;
  return null;
}

function DianBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-7 items-center justify-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-800 ring-1 ring-blue-100">
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
  const { taxSettingsEnabled, taxSettingsLoading, setTaxSettingsEnabled } = useTaxSettings();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personType, setPersonType] = useState<"NATURAL" | "JURIDICA">("NATURAL");
  const [documentType, setDocumentType] =
    useState<"RC" | "CC" | "TE" | "NIT" | "CE" | "PASAPORTE" | "TI">("NIT");
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
  const [isIncomeTaxDeclarant, setIsIncomeTaxDeclarant] = useState(true);
  const [businessProfile, setBusinessProfile] = useState<TaxBusinessProfileKey>("ADVANCED");
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
  const [simpleTaxYear, setSimpleTaxYear] = useState("2026");
  const [simpleTaxGroupCode, setSimpleTaxGroupCode] = useState("");
  const [simpleTaxActivityLabel, setSimpleTaxActivityLabel] = useState("");
  const [simpleTaxFilingMode, setSimpleTaxFilingMode] = useState<"BIMONTHLY_ADVANCE" | "ANNUAL_EXCEPTION">("BIMONTHLY_ADVANCE");
  const [simpleTaxConfigLoaded, setSimpleTaxConfigLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [profile, catalog, rates, simpleTaxConfig] = await Promise.all([
          getTaxProfile().catch(() => null),
          listTaxResponsibilities().catch(() => []),
          listIcaRates().catch(() => []),
          getSimpleTaxConfig()
            .then((data) => ({ loaded: true, data }))
            .catch(() => ({ loaded: false, data: null })),
        ]);

        setResponsibilitiesCatalog(catalog);
        setIcaRates(rates);

        setSimpleTaxConfigLoaded(simpleTaxConfig.loaded);
        if (simpleTaxConfig.data) {
          setSimpleTaxYear(String(simpleTaxConfig.data.taxYear || 2026));
          setSimpleTaxGroupCode(simpleTaxConfig.data.groupCode || "");
          setSimpleTaxActivityLabel(simpleTaxConfig.data.activityLabel || "");
          setSimpleTaxFilingMode(simpleTaxConfig.data.filingMode || "BIMONTHLY_ADVANCE");
        }

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
          setIsIncomeTaxDeclarant(profile.isIncomeTaxDeclarant ?? true);
          const loadedCodes = profile.responsibilities.map((r) => r.responsibility.code);
          setSelectedRespCodes(loadedCodes);
          setBusinessProfile(deriveBusinessProfile(loadedCodes));

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
        toast.error(err.message || "No se pudieron obtener los datos fiscales.");
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

  const handleBusinessProfileChange = (key: TaxBusinessProfileKey) => {
    setBusinessProfile(key);
    if (key === "ADVANCED") return;

    const option = BUSINESS_PROFILE_OPTIONS.find((profile) => profile.key === key);
    if (!option) return;

    setSelectedRespCodes(option.codes);
    setIsIncomeTaxDeclarant(option.declarant);
    if (option.personType) setPersonType(option.personType);
  };

  const handleRespChange = (code: string, checked: boolean) => {
    setBusinessProfile("ADVANCED");
    setSelectedRespCodes((prev) => {
      let next = [...prev];
      if (checked) {
        if (code === "48") next = next.filter((currentCode) => currentCode !== "49");
        if (code === "49") next = next.filter((currentCode) => currentCode !== "48");
        if (!next.includes(code)) next.push(code);
      } else {
        next = next.filter((currentCode) => currentCode !== code);
      }

      const derivedDeclarant = deriveDeclarantFromCodes(next);
      if (derivedDeclarant !== null) setIsIncomeTaxDeclarant(derivedDeclarant);
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
      throw new Error("Ingrese tarifas ICA/ReteICA válidas en por mil.");
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
    setIcaRates((prev) => [...prev.filter((rate) => rate.id !== saved.id), saved]);
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
        isIncomeTaxDeclarant,
        responsibilityCodes: normalizeCodes(selectedRespCodes),
      });

      await saveIcaRate();

      const hasSimpleTaxResponsibility = selectedRespCodes.includes("47");
      const simpleTaxPayload: Parameters<typeof updateSimpleTaxConfig>[0] = {
        enabled: hasSimpleTaxResponsibility,
        taxYear: Number(simpleTaxYear) || 2026,
        groupCode: hasSimpleTaxResponsibility ? simpleTaxGroupCode || null : null,
        activityLabel: hasSimpleTaxResponsibility ? simpleTaxActivityLabel || null : null,
        ciiuCode: hasSimpleTaxResponsibility ? mainCiiuCode || null : null,
      };
      if (simpleTaxConfigLoaded) {
        simpleTaxPayload.filingMode = hasSimpleTaxResponsibility
          ? simpleTaxFilingMode
          : "BIMONTHLY_ADVANCE";
      }
      await updateSimpleTaxConfig(simpleTaxPayload);
      window.dispatchEvent(new Event("tax-profile-updated"));
      router.refresh();
      toast.success("El registro RUT se actualizó correctamente.");
    } catch (err: any) {
      toast.error(err.message || "Verifique los datos ingresados.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Cargando RUT digital...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-slate-950">
      <header className="mx-auto flex max-w-xl items-center px-4 pb-4 pt-5">
        <button
          type="button"
          onClick={() => router.push("/configuracion")}
          aria-label="Volver a configuración"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-700 transition hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 pr-9 text-center">
          <h1 className="text-xl font-black tracking-tight text-slate-950">RUT Digital</h1>
          <p className="mt-0.5 text-xs font-bold text-blue-700">
            Validado con Casillas DIAN
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4">
        {/* Global Tax Toggle Card */}
        <div className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/50 via-white to-blue-50/30 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">RUT e Impuestos Colombianos</h3>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                Activa los cálculos de impuestos (IVA, retenciones), facturación electrónica y Régimen Simple.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={taxSettingsEnabled}
                onChange={(e) => setTaxSettingsEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
            </label>
          </div>
          
          {!taxSettingsEnabled && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800 leading-relaxed">
              <span className="font-bold">⚠️ Complejidad Fiscal Ocultada:</span> El sistema no calculará impuestos en nuevas ventas ni permitirá operaciones del Régimen Simple. Los datos de tu perfil fiscal se conservarán, pero no se aplicarán hasta que actives el switch.
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <section className={`${cardClassName} space-y-3`}>
            <h2 className="text-sm font-black text-slate-900">
              Información del Contribuyente
            </h2>

            <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-3">
              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>05</DianBadge>
                </span>
                <input
                  type="text"
                  required
                  value={nit}
                  onChange={(event) => setNit(event.target.value)}
                  placeholder="Documento fiscal"
                  className={inputClassName}
                />
              </label>

              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>06</DianBadge>
                </span>
                <input
                  type="text"
                  maxLength={1}
                  value={dv}
                  onChange={(event) => setDv(event.target.value)}
                  placeholder="0"
                  className={`${inputClassName} text-center font-black`}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClassName}>Tipo</span>
                <select
                  value={personType}
                  onChange={(event) => setPersonType(event.target.value as "NATURAL" | "JURIDICA")}
                  className={inputClassName}
                >
                  <option value="NATURAL">Persona Natural</option>
                  <option value="JURIDICA">Persona Jurídica</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>24</DianBadge>
                </span>
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as any)}
                  className={inputClassName}
                >
                  <option value="RC">11 - Registro Civil</option>
                  <option value="CC">13 - Cédula de Ciudadanía</option>
                  <option value="TE">21 - Tarjeta de Extranjería</option>
                  <option value="CE">22 - Cédula de Extranjería</option>
                  <option value="NIT">31 - NIT</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className={labelClassName}>
                <DianBadge>35</DianBadge>
              </span>
              <input
                type="text"
                required
                value={tradeName}
                onChange={(event) => setTradeName(event.target.value)}
                placeholder="Nombre o razón social"
                className={inputClassName}
              />
            </label>
          </section>

          <section className={`${cardClassName} space-y-3`}>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <MapPin className="h-4 w-4 text-blue-700" />
              Ubicación
            </h2>

            <label className="block space-y-1.5">
              <span className={labelClassName}>
                <DianBadge>42</DianBadge>
              </span>
              <input
                type="text"
                required
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Dirección fiscal"
                className={inputClassName}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>40</DianBadge>
                </span>
                <input
                  type="text"
                  required
                  value={departmentCode}
                  onChange={(event) => setDepartmentCode(event.target.value)}
                  placeholder="11"
                  className={inputClassName}
                />
              </label>

              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>41</DianBadge>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>44</DianBadge>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="correo@empresa.com"
                  className={inputClassName}
                />
              </label>

              <label className="space-y-1.5">
                <span className={labelClassName}>
                  <DianBadge>43</DianBadge>
                </span>
                <input
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Teléfono / WhatsApp"
                  className={inputClassName}
                />
              </label>
            </div>
          </section>

          <section className={`${cardClassName} space-y-4`}>
            <div className="relative space-y-1.5">
              <span className={labelClassName}>
                <DianBadge>46</DianBadge>
              </span>
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
              <div className="flex items-center justify-between gap-3">
                <span className={labelClassName}>
                  <DianBadge>53</DianBadge>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
                    isIncomeTaxDeclarant
                      ? "bg-blue-50 text-blue-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {isIncomeTaxDeclarant ? "Declarante renta: Sí" : "Declarante renta: No"}
                </span>
              </div>

              <div className="space-y-2">
                {visibleResponsibilities.map((responsibility) => {
                  const selected = selectedRespCodes.includes(responsibility.code);

                  return (
                    <label
                      key={responsibility.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${
                        selected
                          ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-200 hover:bg-white"
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
                        className={`inline-flex min-w-8 items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-black ${
                          selected
                            ? "bg-blue-500 text-white"
                            : "bg-white text-blue-800 ring-1 ring-slate-200"
                        }`}
                      >
                        {responsibility.code}
                      </span>
                      <span className="min-w-0 flex-1 text-xs font-bold">
                        {RESPONSIBILITY_LABELS[responsibility.code] || responsibility.name}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} />}
                    </label>
                  );
                })}
              </div>
            </div>

            {selectedRespCodes.includes("47") && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-emerald-950">
                      Régimen Simple activo según RUT
                    </h3>
                    <p className="mt-1 text-[11px] font-medium text-emerald-800">
                      La liquidación se gestiona desde el módulo Régimen Simple.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/contabilidad/regimen-simple")}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-800 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                  >
                    Ir a liquidar
                  </button>
                </div>
                {simpleTaxConfigLoaded && simpleTaxFilingMode === "ANNUAL_EXCEPTION" && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-medium text-amber-800">
                    <span className="font-bold">Advertencia:</span> Tienes activa la modalidad Excepción Anual de pruebas. Te sugerimos cambiar a la modalidad estándar de <strong>Anticipos bimestrales</strong> para habilitar las liquidaciones normales.
                    <button
                      type="button"
                      onClick={() => setSimpleTaxFilingMode("BIMONTHLY_ADVANCE")}
                      className="mt-2 block font-black text-amber-900 underline hover:text-amber-950"
                    >
                      Volver a Anticipos Bimestrales
                    </button>
                  </div>
                )}
              </div>
            )}

            <details className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-black text-slate-700">
                ICA / ReteICA
              </summary>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
                  {selectedMunicipalityName || "Municipio no disponible"}
                  {municipalityCode ? ` (${municipalityCode})` : ""} ·{" "}
                  {mainCiiuCode ? `CIIU ${mainCiiuCode}` : "CIIU no disponible"}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className={labelClassName}>Tarifa ICA</span>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={icaRatePerMil}
                        onChange={(event) => setIcaRatePerMil(event.target.value)}
                        className={`${inputClassName} pr-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                        ‰
                      </span>
                    </div>
                  </label>

                  <label className="space-y-1.5">
                    <span className={labelClassName}>Tarifa ReteICA</span>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={reteIcaRatePerMil}
                        disabled={useSameReteIcaRate}
                        onChange={(event) => setReteIcaRatePerMil(event.target.value)}
                        className={`${inputClassName} pr-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                        ‰
                      </span>
                    </div>
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
                  <input
                    type="checkbox"
                    checked={useSameReteIcaRate}
                    onChange={(event) => setUseSameReteIcaRate(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  Usar misma tarifa ICA para ReteICA
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClassName}>Base mínima ReteICA UVT</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minBaseUvt}
                    onChange={(event) => setMinBaseUvt(event.target.value)}
                    className={inputClassName}
                  />
                </label>
              </div>
            </details>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-2xl bg-blue-700 px-6 text-sm font-black text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar Registro"}
          </button>
        </form>
      </main>
    </div>
  );
}
