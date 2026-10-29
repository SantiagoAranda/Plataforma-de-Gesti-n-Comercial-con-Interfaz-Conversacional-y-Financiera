"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFactusConfiguration } from "@/src/services/fiscalDocuments";
import type { FactusConfigurationView } from "@/src/types/fiscal-documents";

export function useFactusConfiguration(fiscalRevision: number) {
  const [result, setResult] = useState<{ revision: number; configuration: FactusConfigurationView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setResult(null);
    setLoading(true);
    setError(null);
    try {
      const configuration = await getFactusConfiguration();
      if (request === generation.current) setResult({ revision: fiscalRevision, configuration });
    } catch {
      if (request === generation.current) setError("No se pudo actualizar la configuración de facturación electrónica.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [fiscalRevision]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      generation.current++;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  return { factusConfiguration: result?.revision === fiscalRevision ? result.configuration : null, factusError: error, factusLoading: loading, refreshFactus: refresh };
}
