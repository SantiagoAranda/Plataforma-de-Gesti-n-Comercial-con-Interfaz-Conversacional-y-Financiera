import { useCallback, useEffect, useState } from "react";
import { getTaxProfile, toggleTaxSettings } from "@/src/lib/settings/api";

export function useTaxSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(() => {
    let cancelled = false;
    getTaxProfile()
      .then((profile) => {
        if (!cancelled) {
          setEnabled(profile?.taxSettingsEnabled ?? false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchSettings();

    // Listen for events to sync between components/pages
    const handleSync = () => {
      fetchSettings();
    };

    window.addEventListener("tax-settings-changed", handleSync);
    return () => {
      window.removeEventListener("tax-settings-changed", handleSync);
    };
  }, [fetchSettings]);

  const toggle = useCallback(async (value: boolean) => {
    setEnabled(value);
    try {
      await toggleTaxSettings(value);
      window.dispatchEvent(new Event("tax-settings-changed"));
    } catch (e) {
      setEnabled(!value); // rollback on error
    }
  }, []);

  return {
    taxSettingsEnabled: enabled ?? false,
    taxSettingsLoading: loading,
    setTaxSettingsEnabled: toggle,
  };
}
