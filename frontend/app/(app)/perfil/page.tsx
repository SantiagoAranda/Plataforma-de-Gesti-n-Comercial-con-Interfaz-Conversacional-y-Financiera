"use client";

import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  Building2,
  Camera,
  Eye,
  Globe2,
  ImageIcon,
  Loader2,
  Phone,
  Plus,
  Save,
  Trash2,
  Upload,
  UserCircle2,
  MapPin,
} from "lucide-react";
import { useRouter } from "next/navigation";

import AppHeader from "@/src/components/layout/AppHeader";
import PhoneSelector from "@/src/components/shared/PhoneSelector";
import ColorPickerPopover from "@/src/components/shared/ColorPickerPopover";
import toast from "react-hot-toast";
import { validatePhoneNumber } from "@/src/constants/countryCodes";
import { api } from "@/src/lib/api";
import {
  BUSINESS_LOGO_ACCEPT,
  BusinessLogoProfile,
  deleteBusinessLogo,
  getBusinessProfile,
  readBusinessLogoFileError,
  uploadBusinessLogo,
} from "@/src/lib/businessLogo";
import { readBusinessProfile, writeBusinessProfile } from "@/src/lib/businessProfile";

type FooterPhone = {
  id: string;
  label: string;
  value: string;
};

type FooterSocial = {
  id: string;
  type: string;
  label: string;
  value: string;
};

type StoreFooterSettings = {
  description?: string | null;
  email?: string | null;
  phones?: Array<Omit<FooterPhone, "id">> | null;
  socials?: Array<Omit<FooterSocial, "id">> | null;
  showLogo?: boolean | null;
  showLocationButton?: boolean | null;
  locationLabel?: string | null;
  googleMapsUrl?: string | null;
  footerBackgroundColor?: string | null;
  footerTextColor?: string | null;
};

type PhoneSource = "registration" | "manual" | "hidden";
type EmailSource = "manual" | "hidden";

const selectClassName =
  "h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-800 shadow-sm outline-none transition focus:border-[#0B3F64] focus:ring-2 focus:ring-[#E6EFF5]";
const inputClassName =
  "h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-[#0B3F64] focus:ring-2 focus:ring-[#E6EFF5]";
const colorInputClassName =
  "h-11 w-14 shrink-0 cursor-pointer rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm";
const FOOTER_BACKGROUND_FALLBACK = "#064e3b";
const FOOTER_TEXT_FALLBACK = "#ffffff";

const SOCIAL_TYPES = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X/Twitter" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Sitio Web" },
];
const SOCIAL_TYPE_VALUES = new Set(SOCIAL_TYPES.map((item) => item.value));
const PLACEHOLDER_VALUES = new Set([
  "url o usuario",
  "https://goo.gl/maps/...",
  "email@negocio.com",
  "ingrese numero",
  "ingrese número",
]);

function hasRealValue(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return false;
  return !PLACEHOLDER_VALUES.has(clean.toLowerCase());
}

function isUsableUrl(value: string | null | undefined) {
  const clean = value?.trim();
  return Boolean(clean && hasRealValue(clean) && /^https?:\/\/\S+\.\S+/i.test(clean));
}

function isHexColor(value: string | null | undefined) {
  return /^#[0-9a-fA-F]{6}$/.test(value?.trim() ?? "");
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const clean = value?.trim() ?? "";
  return isHexColor(clean) ? clean.toLowerCase() : fallback;
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSocialLabel(type: string) {
  return SOCIAL_TYPES.find((item) => item.value === type)?.label ?? type;
}

function normalizeSocialValue(type: string, value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;

  const handle = clean.replace(/^@/, "");

  if (type === "instagram") return `https://instagram.com/${handle}`;
  if (type === "facebook") return `https://facebook.com/${handle}`;
  if (type === "youtube") return `https://youtube.com/${handle}`;
  if (type === "tiktok") return `https://tiktok.com/@${handle}`;
  if (type === "linkedin") return `https://linkedin.com/in/${handle}`;
  if (type === "x") return `https://x.com/${handle}`;
  if (type === "whatsapp") return `https://wa.me/${clean.replace(/\D/g, "")}`;
  if (type === "website") return `https://${clean}`;

  return clean;
}

function withPhoneIds(phones: StoreFooterSettings["phones"]): FooterPhone[] {
  return Array.isArray(phones)
    ? phones.map((phone) => ({ ...phone, id: createLocalId() }))
    : [];
}

function withSocialIds(socials: StoreFooterSettings["socials"]): FooterSocial[] {
  return Array.isArray(socials)
    ? socials.map((social) => ({ ...social, id: createLocalId() }))
    : [];
}

function getVisibleSocials(socials: FooterSocial[]) {
  return socials
    .map((social) => ({
      ...social,
      type: social.type.trim().toLowerCase(),
      label: social.label.trim() || getSocialLabel(social.type),
      value: normalizeSocialValue(social.type, social.value),
    }))
    .filter(
      (social) =>
        SOCIAL_TYPE_VALUES.has(social.type) &&
        hasRealValue(social.value) &&
        (social.type === "whatsapp" || isUsableUrl(social.value)),
    );
}

function parsePhone(phoneStr: string) {
  const raw = phoneStr.replace(/\D/g, "");
  const matched = ["57", "54", "52", "34", "56", "51"].find((code) =>
    raw.startsWith(code),
  );
  if (matched) return { code: matched, num: raw.slice(matched.length) };
  return { code: "57", num: raw };
}

function CardHeader({
  icon,
  title,
  description,
  tone = "emerald",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  tone?: "emerald" | "sky" | "violet" | "amber";
}) {
  const toneClass = {
    emerald: "bg-[#E6EFF5] text-[#0B3F64] ring-[#CEE0EC]",
    sky: "bg-[#E6EFF5] text-[#0B3F64] ring-[#CEE0EC]",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  }[tone];

  return (
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${toneClass}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="mt-0.5 text-xs font-medium leading-5 text-neutral-500">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function PerfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [countryCode, setCountryCode] = useState("57");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [business, setBusiness] = useState<BusinessLogoProfile | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [phoneSource, setPhoneSource] = useState<PhoneSource>("hidden");
  const [manualPublicPhone, setManualPublicPhone] = useState("");
  const [emailSource, setEmailSource] = useState<EmailSource>("hidden");
  const [publicEmail, setPublicEmail] = useState("");
  const [extraPhones, setExtraPhones] = useState<FooterPhone[]>([]);
  const [socials, setSocials] = useState<FooterSocial[]>([]);
  const [showFooterLogo, setShowFooterLogo] = useState(false);
  const [loadingFooter, setLoadingFooter] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [manualPhoneError, setManualPhoneError] = useState<string | null>(null);
  const [extraPhoneErrors, setExtraPhoneErrors] = useState<Record<string, string>>({});

  const [showLocationButton, setShowLocationButton] = useState(false);
  const [locationLabel, setLocationLabel] = useState("Cómo llegar");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [footerBackgroundColor, setFooterBackgroundColor] = useState(FOOTER_BACKGROUND_FALLBACK);
  const [footerTextColor, setFooterTextColor] = useState(FOOTER_TEXT_FALLBACK);

  const parseExtra = (val: string) => {
    const raw = val.replace(/\D/g, "");
    const matched = ["57", "54", "52", "34", "56", "51"].find((code) =>
      raw.startsWith(code)
    );
    if (matched) return { code: matched, num: raw.slice(matched.length) };
    return { code: countryCode, num: raw };
  };

  useEffect(() => {
    const profile = readBusinessProfile();
    setName(profile.name || "Mi Negocio");
    setSubtitle(profile.subtitle || "");

    const parsedInit = parsePhone(profile.phone || "");
    setCountryCode(parsedInit.code);
    setPhoneNumber(parsedInit.num);

    let cancelled = false;

    Promise.all([
      getBusinessProfile().catch(() => null),
      api<StoreFooterSettings | null>("/businesses/store-footer-settings").catch(() => null),
    ])
      .then(([businessProfile, footer]) => {
        if (cancelled) return;

        if (businessProfile) {
          setBusiness(businessProfile);
          setName(businessProfile.name || profile.name || "Mi Negocio");
          const parsedApi = parsePhone(businessProfile.phoneWhatsapp || profile.phone || "");
          setCountryCode(parsedApi.code);
          setPhoneNumber(parsedApi.num);
        }

        setSubtitle((current) => footer?.description ?? current);
        setPublicEmail(footer?.email ?? "");
        setEmailSource(footer?.email ? "manual" : "hidden");
        setShowFooterLogo(Boolean(footer?.showLogo));

        setShowLocationButton(Boolean(footer?.showLocationButton && isUsableUrl(footer.googleMapsUrl)));
        setLocationLabel(footer?.locationLabel || "Cómo llegar");
        setGoogleMapsUrl(footer?.googleMapsUrl ?? "");
        setFooterBackgroundColor(
          normalizeHexColor(footer?.footerBackgroundColor, FOOTER_BACKGROUND_FALLBACK),
        );
        setFooterTextColor(normalizeHexColor(footer?.footerTextColor, FOOTER_TEXT_FALLBACK));

        const footerPhones = withPhoneIds(footer?.phones ?? []);
        const registrationPhone = businessProfile?.phoneWhatsapp || profile.phone || "";
        const firstPhone = footerPhones[0];
        if (!firstPhone?.value) {
          setPhoneSource("hidden");
          setManualPublicPhone("");
          setExtraPhones([]);
        } else if (registrationPhone && firstPhone.value.replace(/\D/g, "") === registrationPhone.replace(/\D/g, "")) {
          setPhoneSource("registration");
          setManualPublicPhone("");
          setExtraPhones(footerPhones.slice(1));
        } else {
          setPhoneSource("manual");
          setManualPublicPhone(firstPhone.value);
          setExtraPhones(footerPhones.slice(1));
        }

        setSocials(withSocialIds(footer?.socials ?? []));
      })
      .catch((error) => {
        console.error("Error cargando perfil", error);
        toast.error("No se pudo cargar el perfil");
      })
      .finally(() => {
        if (!cancelled) setLoadingFooter(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const registrationPhone =
    phoneNumber.trim().length > 0 ? `${countryCode}${phoneNumber}` : "";
  const publicPhone =
    phoneSource === "hidden"
      ? ""
      : phoneSource === "registration"
        ? registrationPhone
        : manualPublicPhone.trim();
  const visibleEmail = emailSource === "manual" && hasRealValue(publicEmail) ? publicEmail.trim() : "";
  const visibleSocials = getVisibleSocials(socials);
  const visibleLocationUrl = showLocationButton && isUsableUrl(googleMapsUrl) ? googleMapsUrl.trim() : "";
  const previewFooterBackgroundColor = normalizeHexColor(
    footerBackgroundColor,
    FOOTER_BACKGROUND_FALLBACK,
  );
  const previewFooterTextColor = normalizeHexColor(footerTextColor, FOOTER_TEXT_FALLBACK);

  const initials = (business?.name || name || "Mi Negocio")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const addPhone = () => {
    setExtraPhones((prev) => [
      ...prev,
      { id: createLocalId(), label: "Adicional", value: "" },
    ]);
  };

  const addSocial = () => {
    setSocials((prev) => [
      ...prev,
      { id: createLocalId(), type: "instagram", label: "Instagram", value: "" },
    ]);
  };

  const handleSave = async () => {
    setPhoneError(null);
    setManualPhoneError(null);
    setExtraPhoneErrors({});
    setLocationError(null);

    let hasError = false;

    // 1. Validar teléfono de registro solo si se usa en la tienda (phoneSource === "registration")
    if (phoneSource === "registration") {
      const trimmedNum = phoneNumber.trim();
      if (!trimmedNum) {
        setPhoneError("Agregá un teléfono principal o elegí No mostrar.");
        hasError = true;
      } else {
        const validation = validatePhoneNumber(countryCode, trimmedNum);
        if (!validation.isValid) {
          setPhoneError(validation.error || "Revisá el número antes de guardar.");
          hasError = true;
        }
      }
    }

    // 2. Validar teléfono manual solo si phoneSource === "manual"
    if (phoneSource === "manual") {
      const trimmedManual = manualPublicPhone.trim();
      if (!trimmedManual) {
        setManualPhoneError("Revisá el número antes de guardar.");
        hasError = true;
      } else {
        const parsed = parsePhone(trimmedManual);
        const validation = validatePhoneNumber(parsed.code, parsed.num);
        if (!validation.isValid) {
          setManualPhoneError(validation.error || "Revisá el número antes de guardar.");
          hasError = true;
        }
      }
    }

    // Using component-scoped parseExtra helper instead of local parseAdditionalPhone

    // Limpiar teléfonos adicionales (ignorar vacíos o incompletos)
    const cleanedExtraPhones = extraPhones
      .map((phone) => ({
        ...phone,
        label: phone.label.trim(),
        value: phone.value.trim(),
      }))
      .filter((phone) => {
        if (!phone.value) return false;
        const digits = phone.value.replace(/\D/g, "");
        if (!digits) return false;
        const parsed = parseExtra(phone.value);
        if (!parsed.num) return false;
        return true;
      });

    // Validar teléfonos adicionales restantes
    const newExtraErrors: Record<string, string> = {};
    cleanedExtraPhones.forEach((phone) => {
      const parsed = parseExtra(phone.value);
      const validation = validatePhoneNumber(parsed.code, parsed.num);
      if (!validation.isValid) {
        newExtraErrors[phone.id] = validation.error || "Revisá el número antes de guardar.";
        hasError = true;
      }
    });

    // 3. Validar ubicación si showLocationButton está habilitado
    if (showLocationButton) {
      const trimmedUrl = googleMapsUrl.trim();
      if (!trimmedUrl) {
        setLocationError("Ingresá un enlace de Google Maps.");
        hasError = true;
      } else if (!isUsableUrl(trimmedUrl)) {
        setLocationError("Ingresá un enlace real que comience con http:// o https://");
        hasError = true;
      }
    }

    if (hasError) {
      setExtraPhoneErrors(newExtraErrors);
      return;
    }

    setSaving(true);

    const fullPhone = registrationPhone;
    const phonesPayload = [
      ...(publicPhone ? [{ label: "Principal", value: publicPhone }] : []),
      ...cleanedExtraPhones.map((phone) => ({
        label: phone.label || "Adicional",
        value: phone.value,
      })),
    ];

    const socialsPayload = visibleSocials.map((social) => ({
      type: social.type,
      label: social.label,
      value: social.value,
    }));

    try {
      writeBusinessProfile({
        name: name.trim(),
        subtitle: subtitle.trim(),
        phone: fullPhone,
      });

      const footer = await api<StoreFooterSettings>("/businesses/store-footer-settings", {
        method: "PATCH",
        body: JSON.stringify({
          description: subtitle.trim() || null,
          email: visibleEmail || null,
          phones: phonesPayload,
          socials: socialsPayload,
          showLogo: showFooterLogo,
          showLocationButton: Boolean(visibleLocationUrl),
          locationLabel: locationLabel.trim() || null,
          googleMapsUrl: visibleLocationUrl || null,
          footerBackgroundColor: previewFooterBackgroundColor,
          footerTextColor: previewFooterTextColor,
        }),
      });

      setPublicEmail(footer.email ?? "");
      setShowFooterLogo(Boolean(footer.showLogo));
      setSocials(withSocialIds(footer.socials ?? []));

      setShowLocationButton(Boolean(footer.showLocationButton && isUsableUrl(footer.googleMapsUrl)));
      setLocationLabel(footer.locationLabel ?? "Cómo llegar");
      setGoogleMapsUrl(footer.googleMapsUrl ?? "");
      setFooterBackgroundColor(
        normalizeHexColor(footer.footerBackgroundColor, FOOTER_BACKGROUND_FALLBACK),
      );
      setFooterTextColor(normalizeHexColor(footer.footerTextColor, FOOTER_TEXT_FALLBACK));
      const savedPhones = withPhoneIds(footer.phones ?? []);
      if (phoneSource === "manual") {
        setManualPublicPhone(savedPhones[0]?.value ?? "");
        setExtraPhones(savedPhones.slice(1));
      } else {
        setExtraPhones(savedPhones.slice(publicPhone ? 1 : 0));
      }

      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      toast.success("Perfil guardado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileError = readBusinessLogoFileError(file);
    if (fileError) {
      setLogoError(fileError);
      toast.error(fileError);
      return;
    }

    setLogoBusy(true);
    setLogoError(null);

    try {
      const updated = await uploadBusinessLogo(file);
      setBusiness(updated);
      toast.success("Logo actualizado");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "No se pudo subir el logo";
      setLogoError(message);
      toast.error(message);
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
      toast.success("Logo eliminado");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "No se pudo eliminar el logo";
      setLogoError(message);
      toast.error(message);
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-full max-w-full flex-col overflow-x-hidden bg-white box-border">
      <AppHeader title="Perfil" subtitle="Datos del negocio" showBack hrefBack="/home" />

      <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 pb-10 box-border">
        <div className="mx-auto w-full max-w-xl space-y-4 overflow-visible box-border">
          <section className="w-full max-w-full overflow-visible rounded-3xl border border-black/5 bg-white p-5 shadow-sm box-border">
            <CardHeader
              title="Logo"
              description="Usa una imagen clara para tu tienda y recibos."
            />

            <div className="mt-5 flex flex-col items-center justify-center text-center space-y-4">
              {/* WhatsApp-style large circular profile picture */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-slate-100 bg-slate-100 shadow-md transition hover:scale-105 hover:shadow-lg active:scale-95"
                title="Presiona para cambiar la imagen"
              >
                {business?.logoUrl ? (
                  <img
                    src={business.logoUrl}
                    alt={`Logo de ${business.name}`}
                    className="h-full w-full object-cover"
                  />
                ) : initials ? (
                  <span className="text-2xl font-bold text-slate-500">{initials}</span>
                ) : (
                  <UserCircle2 className="h-16 w-16 text-slate-400" />
                )}

                {/* Hover camera overlay (WhatsApp style) */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-7 w-7 mb-0.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Cambiar</span>
                </div>
              </div>

              <div className="max-w-xs text-center">
                <p className="text-xs font-medium leading-5 text-neutral-500">
                  JPG, PNG o WEBP hasta 2 MB. Se optimiza antes de guardarlo.
                </p>
                {logoError && (
                  <p className="mt-1 text-xs font-semibold text-red-500">
                    {logoError}
                  </p>
                )}
              </div>

              {/* Side-by-side action buttons */}
              <div className="flex w-full max-w-sm items-center gap-3 pt-1">
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
                  className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {logoBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Cambiar
                </button>
                {business?.logoUrl && (
                  <button
                    type="button"
                    disabled={logoBusy}
                    onClick={handleDeleteLogo}
                    className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="w-full max-w-full overflow-visible rounded-3xl border border-black/5 bg-white p-5 shadow-sm box-border">
            <CardHeader
              icon={<Building2 className="h-5 w-5" />}
              title="Empresa"
              description="Edita el nombre y la descripcion publica del negocio."
            />

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Nombre
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre de la empresa"
                  className={inputClassName}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Descripcion publica
                </span>
                <textarea
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Descripcion corta (opcional)"
                  rows={3}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
          </section>

          <section className="w-full max-w-full overflow-visible rounded-3xl border border-black/5 bg-white p-5 shadow-sm box-border">
            <CardHeader
              icon={<Phone className="h-5 w-5" />}
              title="Contacto publico"
              description="Define como pueden contactarte desde tu tienda."
              tone="sky"
            />

            <div className="mt-4 space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Telefono principal del negocio
                </label>
                <PhoneSelector
                  countryCode={countryCode}
                  onCountryCodeChange={(val) => {
                    setCountryCode(val);
                    setPhoneError(null);
                  }}
                  phoneNumber={phoneNumber}
                  onPhoneNumberChange={(val) => {
                    setPhoneNumber(val);
                    setPhoneError(null);
                  }}
                />
                {phoneError && (
                  <p className="mt-1 text-xs font-semibold text-red-500">{phoneError}</p>
                )}
              </div>

              <div className="block space-y-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Mostrar telefono en tienda
                </span>
                <select
                  value={phoneSource}
                  onChange={(event) => {
                    setPhoneSource(event.target.value as PhoneSource);
                    setPhoneError(null);
                    setManualPhoneError(null);
                  }}
                  className={selectClassName}
                >
                  <option value="registration">Usar telefono del registro</option>
                  <option value="manual">Escribir manualmente</option>
                  <option value="hidden">No mostrar</option>
                </select>
                {phoneSource === "manual" && (
                  <div className="mt-2">
                    <PhoneSelector
                      countryCode={parsePhone(manualPublicPhone).code}
                      onCountryCodeChange={(val) => {
                        setManualPublicPhone(`${val}${parsePhone(manualPublicPhone).num}`);
                        setManualPhoneError(null);
                      }}
                      phoneNumber={parsePhone(manualPublicPhone).num}
                      onPhoneNumberChange={(val) => {
                        setManualPublicPhone(`${parsePhone(manualPublicPhone).code}${val}`);
                        setManualPhoneError(null);
                      }}
                    />
                  </div>
                )}
                {phoneSource === "manual" && manualPhoneError && (
                  <p className="mt-1 text-xs font-semibold text-red-500">{manualPhoneError}</p>
                )}
                <p className="text-xs text-neutral-500">
                  Vista previa: {phoneSource === "hidden" ? "No se mostrará teléfono en la tienda" : (publicPhone || "No disponible")}
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Email publico
                </span>
                <select
                  value={emailSource}
                  onChange={(event) => setEmailSource(event.target.value as EmailSource)}
                  className={selectClassName}
                >
                  <option value="manual">Ingresar manualmente</option>
                  <option value="hidden">No mostrar</option>
                </select>
                {emailSource === "manual" && (
                  <input
                    type="email"
                    value={publicEmail}
                    onChange={(event) => setPublicEmail(event.target.value)}
                    placeholder="email@negocio.com"
                    className={inputClassName}
                  />
                )}
                <p className="text-xs text-neutral-500">
                  Vista previa: {visibleEmail || "No disponible"}
                </p>
              </label>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Telefonos adicionales
                  </span>
                  <button
                    type="button"
                    onClick={addPhone}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </button>
                </div>

                <div className="space-y-2">
                  {extraPhones.map((phone, index) => {
                    const error = extraPhoneErrors[phone.id];
                    return (
                      <div key={phone.id} className="space-y-2 rounded-2xl border border-neutral-100 p-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={phone.label}
                            onChange={(event) =>
                              setExtraPhones((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Etiqueta (ej: Ventas)"
                            className={`${inputClassName} min-w-0`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setExtraPhones((prev) =>
                                prev.filter((_, itemIndex) => itemIndex !== index),
                              );
                              setExtraPhoneErrors((prev) => {
                                const next = { ...prev };
                                delete next[phone.id];
                                return next;
                              });
                            }}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                            aria-label="Eliminar telefono"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <PhoneSelector
                          countryCode={parseExtra(phone.value).code}
                          onCountryCodeChange={(val) => {
                            const newNum = parseExtra(phone.value).num;
                            setExtraPhones((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: `${val}${newNum}` }
                                  : item,
                              ),
                            );
                            setExtraPhoneErrors((prev) => {
                              const next = { ...prev };
                              delete next[phone.id];
                              return next;
                            });
                          }}
                          phoneNumber={parseExtra(phone.value).num}
                          onPhoneNumberChange={(val) => {
                            const newCode = parseExtra(phone.value).code;
                            setExtraPhones((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: `${newCode}${val}` }
                                  : item,
                              ),
                            );
                            setExtraPhoneErrors((prev) => {
                              const next = { ...prev };
                              delete next[phone.id];
                              return next;
                            });
                          }}
                        />
                        {error && (
                          <p className="text-xs font-semibold text-red-500 pl-1">{error}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Redes sociales
                  </span>
                  <button
                    type="button"
                    onClick={addSocial}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </button>
                </div>

                <div className="space-y-2">
                  {socials.map((social, index) => (
                    <div key={social.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_40px]">
                      <select
                        value={social.type}
                        onChange={(event) => {
                          const type = event.target.value;
                          setSocials((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, type, label: getSocialLabel(type) }
                                : item,
                            ),
                          );
                        }}
                        className={selectClassName}
                      >
                        {SOCIAL_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 sm:contents">
                        <input
                          value={social.value}
                          onChange={(event) =>
                            setSocials((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="URL o usuario"
                          className={inputClassName}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSocials((prev) =>
                              prev.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          className="grid h-11 place-items-center rounded-2xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar red social"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          {/* Card: Ubicación del negocio */}
          <section className="w-full max-w-full overflow-visible rounded-3xl border border-black/5 bg-white p-5 shadow-sm box-border">
            <CardHeader
              icon={<MapPin className="h-5 w-5" />}
              title="Ubicación del negocio"
              description="Habilita un botón en tu tienda para que tus clientes localicen tu local físico."
              tone="violet"
            />

            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLocationButton}
                  onChange={(event) => {
                    setShowLocationButton(event.target.checked);
                    setLocationError(null);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-800">
                    Mostrar botón "Cómo llegar" en la tienda
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                    Permite a tus clientes abrir Google Maps con la ubicación de tu negocio.
                  </span>
                </span>
              </label>

              {showLocationButton && (
                <>
                  <div className="block space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      Texto del botón
                    </span>
                    <input
                      value={locationLabel}
                      onChange={(event) => {
                        setLocationLabel(event.target.value);
                        setLocationError(null);
                      }}
                      placeholder="Cómo llegar"
                      className={inputClassName}
                    />
                  </div>

                  <div className="block space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                      Enlace de Google Maps
                    </span>
                    <input
                      value={googleMapsUrl}
                      onChange={(event) => {
                        setGoogleMapsUrl(event.target.value);
                        setLocationError(null);
                      }}
                      placeholder="https://goo.gl/maps/..."
                      className={inputClassName}
                    />
                    {locationError && (
                      <p className="mt-1 text-xs font-semibold text-red-500">{locationError}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="w-full max-w-full overflow-visible rounded-3xl border border-black/5 bg-white p-5 shadow-sm box-border">
            <CardHeader
              icon={<Globe2 className="h-5 w-5" />}
              title="Footer de tienda publica"
              description="Configura como se muestra la informacion al pie de tu tienda."
              tone="amber"
            />

            <div className="mt-4 space-y-4">
              <label className="flex items-start gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={showFooterLogo}
                  onChange={(event) => setShowFooterLogo(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-800">
                    Mostrar foto/logo de perfil en el footer
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                    Se muestra centrado arriba, en tamano pequeno.
                  </span>
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Color de fondo
                  </span>
                  <ColorPickerPopover
                    color={footerBackgroundColor}
                    onChange={(newColor) => setFooterBackgroundColor(newColor)}
                    fallbackColor={FOOTER_BACKGROUND_FALLBACK}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Color de letra
                  </span>
                  <ColorPickerPopover
                    color={footerTextColor}
                    onChange={(newColor) => setFooterTextColor(newColor)}
                    fallbackColor={FOOTER_TEXT_FALLBACK}
                  />
                </label>
              </div>

              <div
                className="rounded-3xl border border-emerald-900/10 bg-emerald-950 px-5 py-4 text-center text-white"
                style={{ backgroundColor: previewFooterBackgroundColor, color: previewFooterTextColor }}
              >
                <p
                  className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: previewFooterTextColor, opacity: 0.82 }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Vista previa
                </p>
                {showFooterLogo && business?.logoUrl ? (
                  <img
                    src={business.logoUrl}
                    alt={business.name || name}
                    className="mx-auto mb-3 h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14"
                  />
                ) : null}
                <p className="text-sm font-bold" style={{ color: previewFooterTextColor }}>{name || "Mi Negocio"}</p>
                {subtitle ? (
                  <p
                    className="mx-auto mt-1 max-w-xs text-xs leading-5"
                    style={{ color: previewFooterTextColor, opacity: 0.8 }}
                  >
                    {subtitle}
                  </p>
                ) : null}
                {publicPhone ? (
                  <p className="mt-2 text-xs" style={{ color: previewFooterTextColor, opacity: 0.8 }}>Tel: {publicPhone}</p>
                ) : null}
                {visibleEmail ? (
                  <p className="text-xs" style={{ color: previewFooterTextColor, opacity: 0.8 }}>{visibleEmail}</p>
                ) : null}
                {visibleSocials.length > 0 ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {visibleSocials.map((social, index) => (
                      <span
                        key={`${social.type}-${index}`}
                        className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-white/10"
                        style={{ color: previewFooterTextColor }}
                      >
                        {social.label || getSocialLabel(social.type)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {visibleLocationUrl ? (
                  <div className="mt-3 flex justify-center">
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-white/10"
                      style={{ color: previewFooterTextColor }}
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      {locationLabel || "Cómo llegar"}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pb-2">
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="rounded-full px-5 py-3 text-sm font-semibold text-neutral-600 hover:bg-black/5"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingFooter}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saved ? "Guardado" : saving ? "Guardando" : "Guardar"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
