import { useEffect, useState } from "react";
import { getFeatureFlags } from "@/src/lib/featureFlags";

export function useFeatureFlags() {
  const [simpleRegimeEnabled, setSimpleRegimeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFeatureFlags()
      .then((flags) => {
        if (!cancelled) setSimpleRegimeEnabled(flags.simpleRegimeEnabled === true);
      })
      .catch(() => {
        if (!cancelled) setSimpleRegimeEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { simpleRegimeEnabled, featureFlagsLoading: loading };
}
