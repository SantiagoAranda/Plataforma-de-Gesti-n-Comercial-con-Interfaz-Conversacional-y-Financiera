"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CommercialDocumentViewer from "@/src/components/commercial-documents/CommercialDocumentViewer";
import { quotationToDocumentData } from "@/src/lib/quotations/quotationPresentation";
import type { Quotation } from "@/src/types/quotations";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Loaded = { quotation: Quotation; business: { name: string; fiscalId: string; phoneWhatsapp: string } };

/** Página pública: el cliente ve su cotización con el enlace que recibe, sin iniciar sesión. */
export default function PublicQuotationPage() {
  const { token } = useParams<{ token: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/public/quotations/${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: Loaded) => {
        setLoaded(data);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [token]);

  const data = useMemo(
    () => (loaded ? quotationToDocumentData(loaded.quotation, loaded.business) : null),
    [loaded],
  );

  if (status === "loading") return <p className="mt-10 text-center text-sm text-slate-400">Cargando cotización…</p>;
  if (status === "missing" || !data) {
    return <p className="mt-10 text-center text-sm text-slate-500">No encontramos esta cotización. Revisa el enlace.</p>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-3">
      <CommercialDocumentViewer kind="quotation" data={data} />
    </main>
  );
}
