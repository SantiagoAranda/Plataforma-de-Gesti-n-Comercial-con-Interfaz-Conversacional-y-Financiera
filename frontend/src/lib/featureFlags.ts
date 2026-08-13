import { api } from "@/src/lib/api";

export type FeatureFlags = {
  simpleRegimeSalesEnabled: boolean;
  simpleRegimeTaxModuleEnabled: boolean;
  /** @deprecated Use simpleRegimeSalesEnabled. */
  simpleRegimeEnabled: boolean;
};

export function getFeatureFlags() {
  return api<FeatureFlags>("/settings/feature-flags");
}
