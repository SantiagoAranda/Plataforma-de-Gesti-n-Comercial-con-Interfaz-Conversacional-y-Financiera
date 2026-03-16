const BUSINESS_TIME_ZONE = "America/Bogota";

type DateInput = string | number | Date;

function toDate(value: DateInput) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  return date;
}

function getFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export function getBusinessTimeZone() {
  return BUSINESS_TIME_ZONE;
}

export function getBusinessDayKey(value: DateInput) {
  const date = toDate(value);
  const parts = getFormatter("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format business day key");
  }

  return `${year}-${month}-${day}`;
}

export function isSameBusinessDay(a: DateInput, b: DateInput) {
  return getBusinessDayKey(a) === getBusinessDayKey(b);
}

export function getRelativeBusinessDayLabel(
  value: DateInput,
  locale = "es-AR",
) {
  const date = toDate(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameBusinessDay(date, today)) return "Hoy";
  if (isSameBusinessDay(date, yesterday)) return "Ayer";

  return getFormatter(locale, {
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatBusinessDateTime(
  value: DateInput,
  locale = "es-AR",
  options?: Intl.DateTimeFormatOptions,
) {
  return getFormatter(locale, options ?? {}).format(toDate(value));
}

export function formatBusinessTime(
  value: DateInput,
  locale = "es-AR",
) {
  return formatBusinessDateTime(value, locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
