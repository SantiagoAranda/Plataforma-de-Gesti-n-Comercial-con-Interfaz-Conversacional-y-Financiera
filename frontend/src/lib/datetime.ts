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
