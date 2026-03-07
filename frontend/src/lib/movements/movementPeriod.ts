import type { MovementPeriodKey } from "@/src/types/movements-ui";

type PeriodRange = { from: string; to: string; label: string };

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function periodRange(key: MovementPeriodKey, now = new Date()): PeriodRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (key === "LAST_30_DAYS") {
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { from: iso(start), to: iso(end), label: "Últimos 30 días" };
  }

  if (key === "PREVIOUS_MONTH") {
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const close = new Date(end.getFullYear(), end.getMonth(), 0);
    const label = start.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return { from: iso(start), to: iso(close), label };
  }

  // THIS_MONTH
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const label = start.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return { from: iso(start), to: iso(end), label };
}
