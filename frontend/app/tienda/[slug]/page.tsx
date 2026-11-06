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
const FALLBACK_METADATA = { title: { absolute: "Tienda" }, icons: { icon: "/favicon.ico" } };

function decodeSlug(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// null = no active store (404); undefined = backend unavailable, keep the previous client rendering.
const resolveStore = cache(async (slug: string): Promise<Store | null | undefined> => {
  try {
    const res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}/resolve`, { cache: "no-store" });
    if (res.status === 404) return null;
    return res.ok ? ((await res.json()) as Store) : undefined;
  } catch (error) {
    console.error("Error resolving tienda slug:", error);
    return undefined;
  }
});

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
    icons: { icon: store.logoUrl || "/favicon.ico" },
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
  return <PublicStoreClient />;
}
