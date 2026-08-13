import { useEffect, useState } from "react";
import { getFeatureFlags } from "@/src/lib/featureFlags";

export function useFeatureFlags() {
  const [simpleRegimeSalesEnabled, setSimpleRegimeSalesEnabled] = useState(false);
  const [simpleRegimeTaxModuleEnabled, setSimpleRegimeTaxModuleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags()
      .then((flags) => {
        if (!cancelled) {
          setSimpleRegimeSalesEnabled(
            flags.simpleRegimeSalesEnabled === true ||
              (flags.simpleRegimeSalesEnabled === undefined && flags.simpleRegimeEnabled === true),
          );
          setSimpleRegimeTaxModuleEnabled(flags.simpleRegimeTaxModuleEnabled === true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSimpleRegimeSalesEnabled(false);
          setSimpleRegimeTaxModuleEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    simpleRegimeSalesEnabled,
    simpleRegimeTaxModuleEnabled,
    /** @deprecated Use simpleRegimeSalesEnabled. */
    simpleRegimeEnabled: simpleRegimeSalesEnabled,
    featureFlagsLoading: loading,
  };
}
