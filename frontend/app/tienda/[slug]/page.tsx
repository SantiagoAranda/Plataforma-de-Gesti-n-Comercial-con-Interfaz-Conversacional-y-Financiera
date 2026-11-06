import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import PublicStoreClient from "./PublicStoreClient";

type SearchParams = Record<string, string | string[] | undefined>;
interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<SearchParams>;
}
type Store = { slug: string; name: string; logoUrl: string | null };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
// No `icons` here: setting them replaces the root layout's SACTEC favicon for the whole route.
const FALLBACK_METADATA = { title: { absolute: "Tienda" } };

function decodeSlug(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// null = no active store (404); undefined = backend unavailable, keep the previous client rendering.
const resolveStore = cache(async (slug: string): Promise<Store | null | undefined> => {
  try {
    const res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}/resolve`, { cache: "no-store" });
    // Only the backend's explicit answer means "no store"; a 404 for a missing route (older backend) is treated as unavailable.
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
      return body?.message === "Tienda no encontrada" ? null : undefined;
    }
    return res.ok ? ((await res.json()) as Store) : undefined;
  } catch (error) {
    console.error("Error resolving tienda slug:", error);
    return undefined;
  }
});

// Precarga de productos (categoría inicial) con el slug canónico; el cliente la reutiliza.
const getStoreItems = (slug: string) =>
  fetch(`${API_URL}/public/${encodeURIComponent(slug)}/items?type=`, { next: { revalidate: 60 } });

export async function generateMetadata({ params }: Props) {
  const slug = decodeSlug((await params)?.slug ?? "");
  const store = slug ? await resolveStore(slug) : undefined;
  if (!store) return FALLBACK_METADATA;
  const requestHeaders = await headers();
  const first = (name: string) => requestHeaders.get(name)?.split(",")[0].trim();
  const host = first("x-forwarded-host") ?? first("host");
  const protocol = first("x-forwarded-proto") ?? "https";
  return {
    title: { absolute: store.name || "Tienda" },
    // Historical slugs redirect, so the current slug is the only indexable address.
    ...(host && { alternates: { canonical: `${protocol}://${host}/tienda/${encodeURIComponent(store.slug)}` } }),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const slug = decodeSlug((await params).slug);
  const store = await resolveStore(slug);
  if (store === null) notFound();
  if (store && store.slug !== slug) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries((await searchParams) ?? {})) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
    }
    // Relative path built from the server's canonical slug: one hop, never another origin.
    permanentRedirect(`/tienda/${encodeURIComponent(store.slug)}${query.size ? `?${query}` : ""}`);
  }
  let initialData = null;
  try {
    const res = await getStoreItems(store?.slug ?? slug);
    if (res.ok) initialData = await res.json();
  } catch {
    // el cliente reintenta el fetch si no hay datos iniciales
  }
  return <PublicStoreClient initialData={initialData} />;
}
