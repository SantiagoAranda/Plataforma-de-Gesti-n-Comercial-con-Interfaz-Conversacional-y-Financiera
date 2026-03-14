import type { MovementPeriodKey } from "@/src/types/movements-ui";

type PeriodRange = { from: string; to: string; label: string };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export function periodRange(
  key: MovementPeriodKey,
  now = new Date(),
): PeriodRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (key === "LAST_30_DAYS") {
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { from: formatLocalDate(start), to: formatLocalDate(end), label: "Ultimos 30 dias" };
  }

  if (key === "PREVIOUS_MONTH") {
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const close = new Date(end.getFullYear(), end.getMonth(), 0);
    const label = start.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
    return { from: formatLocalDate(start), to: formatLocalDate(close), label };
  }

  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const label = start.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return { from: formatLocalDate(start), to: formatLocalDate(end), label };
}
