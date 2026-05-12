export type BusinessProfile = {
  name: string;
  subtitle: string;
  phone: string;
};

const KEYS = {
  name: "businessName",
  subtitle: "businessSubtitle",
  phone: "businessPhone",
} as const;

export function readBusinessProfile(): BusinessProfile {
  if (typeof window === "undefined") {
    return { name: "Mi Negocio", subtitle: "", phone: "" };
  }

  return {
    name: localStorage.getItem(KEYS.name) || "Mi Negocio",
    subtitle: localStorage.getItem(KEYS.subtitle) || "",
    phone: localStorage.getItem(KEYS.phone) || "",
  };
}

export function writeBusinessProfile(next: Partial<BusinessProfile>) {
  if (typeof window === "undefined") return;

  if (typeof next.name === "string") localStorage.setItem(KEYS.name, next.name);
  if (typeof next.subtitle === "string") localStorage.setItem(KEYS.subtitle, next.subtitle);
  if (typeof next.phone === "string") localStorage.setItem(KEYS.phone, next.phone);
}

