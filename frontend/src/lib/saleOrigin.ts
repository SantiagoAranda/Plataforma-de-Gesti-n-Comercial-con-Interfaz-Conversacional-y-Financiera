import type { Sale } from "@/src/types/sales";

export function getSaleOriginLabel(origin?: Sale["origin"]) {
  if (origin === "PUBLIC_STORE") return "Automática";
  return "Manual";
}

export function getSaleOriginStyles(origin?: Sale["origin"]) {
  if (origin === "PUBLIC_STORE") {
    return "bg-indigo-50 text-indigo-700 border border-indigo-100";
  }
  return "bg-neutral-100 text-neutral-600 border border-neutral-200";
}
