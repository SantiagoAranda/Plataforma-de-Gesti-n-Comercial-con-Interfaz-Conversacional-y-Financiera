import { api } from "./api";
import { getSessionContext, assertCurrentSession } from './auth/session';
import { writeBusinessProfile } from './businessProfile';

export type BusinessLogoProfile = {
  id: string;
  name: string;
  slug: string;
  fiscalId: string;
  phoneWhatsapp: string;
  logoUrl: string | null;
  logoObjectKey: string | null;
  logoMimeType: string | null;
  logoSizeBytes: number | null;
  status: string;
};

export const MAX_BUSINESS_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
export const BUSINESS_LOGO_ACCEPT = "image/jpeg,image/png,image/webp";

export function readBusinessLogoFileError(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "El logo debe ser JPG, PNG o WEBP.";
  }

  if (file.size > MAX_BUSINESS_LOGO_SIZE_BYTES) {
    return "El logo no puede superar los 2 MB.";
  }

  return null;
}

export async function getBusinessProfile() {
  const session = getSessionContext();
  const profile = await api<BusinessLogoProfile>("/businesses/profile");
  assertCurrentSession(session);
  if (profile.id === session.businessId) {
    try {
      writeBusinessProfile({ name: profile.name, phone: profile.phoneWhatsapp });
      localStorage.setItem('businessSlug', profile.slug);
      window.dispatchEvent(new Event('business-profile-updated'));
    } catch { /* Reading the profile remains possible if browser storage is full. */ }
  }
  return profile;
}

export function uploadBusinessLogo(file: File) {
  const formData = new FormData();
  formData.append("logo", file);

  return api<BusinessLogoProfile>("/businesses/profile/logo", {
    method: "POST",
    body: formData,
  });
}

export function deleteBusinessLogo() {
  return api<BusinessLogoProfile>("/businesses/profile/logo", {
    method: "DELETE",
  });
}
