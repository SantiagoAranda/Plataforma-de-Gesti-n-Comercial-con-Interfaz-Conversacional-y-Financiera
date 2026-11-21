import type { Metadata } from "next";

export const SACTEC_DESCRIPTION =
  "SACTEC es una plataforma de gestión comercial que te permite administrar productos, servicios, ventas, reservas y movimientos de tu negocio de manera simple, rápida y organizada.";
export const SACTEC_SHARE_IMAGE = { url: "/brand/sactec-og.png", width: 1200, height: 630, alt: "SACTEC" };

// Business names are user text: collapse whitespace/control chars (React escapes the rest when rendering meta tags).
export const cleanText = (value: string | null | undefined) =>
  (value ?? "").replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();

// Only an absolute public https URL is shareable; relative, http, localhost or malformed values fall back to SACTEC.
function shareImage(url: string | null | undefined, alt: string) {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol === "https:" && parsed.hostname !== "localhost") return { url: parsed.href, alt };
  } catch {}
  return SACTEC_SHARE_IMAGE;
}

// A child openGraph/twitter replaces the root layout's object entirely, so every field is set here.
export function shareMetadata(input: {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string | null;
  imageAlt: string;
}): Metadata {
  const image = shareImage(input.imageUrl, input.imageAlt);
  return {
    title: { absolute: input.title },
    description: input.description,
    openGraph: {
      type: "website",
      siteName: "SACTEC",
      title: input.title,
      description: input.description,
      ...(input.url && { url: input.url }),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image.url],
    },
  };
}
