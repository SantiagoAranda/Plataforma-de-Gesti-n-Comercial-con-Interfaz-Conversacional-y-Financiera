"use client";

import { useEffect, useMemo, useState } from "react";
import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";
import { listFiscalMunicipalities } from "@/src/services/fiscalDocuments";
import type { FiscalMunicipality } from "@/src/types/fiscal-documents";

const fallback: FiscalMunicipality[] = COLOMBIAN_MUNICIPALITIES.map((item) => ({
  ...item,
  department: { code: item.code.slice(0, 2), name: "" },
}));

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useFiscalMunicipalities(enabled = true, publicSlug?: string) {
  const [municipalities, setMunicipalities] = useState<FiscalMunicipality[]>(fallback);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const request = publicSlug
      ? fetch(`${API_URL}/public/${encodeURIComponent(publicSlug)}/fiscal-municipalities`).then((response) => {
          if (!response.ok) throw new Error("No se pudo cargar el catálogo de municipios");
          return response.json() as Promise<FiscalMunicipality[]>;
        })
      : listFiscalMunicipalities();
    request
      .then((items) => {
        if (active && items.length) setMunicipalities(items);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [enabled, publicSlug]);
  return useMemo(
    () => [...municipalities].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [municipalities],
  );
}
