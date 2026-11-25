import { api } from "@/src/lib/api";

export type FeatureFlags = {
  simpleRegimeSalesEnabled: boolean;
  simpleRegimeTaxModuleEnabled: boolean;
  /** @deprecated Use simpleRegimeSalesEnabled. */
  simpleRegimeEnabled: boolean;
  /** Definitive contract termination; off until the payroll provision risk is resolved. */
  payrollContractTerminationEnabled?: boolean;
};

export function getFeatureFlags() {
  return api<FeatureFlags>("/settings/feature-flags");
}
