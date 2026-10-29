"use client";

import { useContext } from "react";
import { TaxSettingsContext } from "@/src/components/settings/TaxSettingsProvider";

export function useTaxSettings() {
  const context = useContext(TaxSettingsContext);
  if (!context) throw new Error("useTaxSettings requires TaxSettingsProvider");
  return context;
}
