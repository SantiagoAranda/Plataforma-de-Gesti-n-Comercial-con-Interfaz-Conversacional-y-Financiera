import { api } from "./api";

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

export function getBusinessProfile() {
  return api<BusinessLogoProfile>("/businesses/profile");
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
