export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTimeValue(dateKey: string, time: string) {
  return `${dateKey}T${time}:00`;
}

export function parseLocalDateTimeParts(value?: string | null) {
  if (!value) return null;
  const [datePart, timePartRaw] = value.split("T");
  if (!datePart || !timePartRaw) return null;
  const timePart = timePartRaw.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  if (!/^\d{2}:\d{2}$/.test(timePart)) return null;
  return { date: datePart, time: timePart };
}

/**
 * Formatea una fecha en modo compacto (solo hora o fecha corta).
 * Ejemplo: 17:45 o 20/03
 */
export function formatCompactDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * Formatea una fecha completa con hora.
 * Ejemplo: 20/03/2026, 17:45
 */
export function formatFullDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
