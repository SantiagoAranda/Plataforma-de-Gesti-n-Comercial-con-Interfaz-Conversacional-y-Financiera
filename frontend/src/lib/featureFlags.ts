import { api } from "@/src/lib/api";

export type FeatureFlags = {
  simpleRegimeEnabled: boolean;
};

export function getFeatureFlags() {
  return api<FeatureFlags>("/settings/feature-flags");
}
