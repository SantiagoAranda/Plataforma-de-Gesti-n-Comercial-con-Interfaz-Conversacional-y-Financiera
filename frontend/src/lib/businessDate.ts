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

type BusinessDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getBusinessDateTimeParts(value: DateInput): BusinessDateTimeParts {
  const parts = getFormatter("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(toDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const result = parts.find((item) => item.type === type)?.value;
    if (result === undefined) throw new Error(`Missing business date part: ${type}`);
    return Number(result);
  };

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

export function getBusinessTimeKey(value: DateInput) {
  const { hour, minute } = getBusinessDateTimeParts(value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function businessDateTimeToISOString(dateKey: string, timeKey: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeKey);
  if (!dateMatch || !timeMatch) return null;

  const requested = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  if (requested.hour > 23 || requested.minute > 59) return null;

  const civilCheck = new Date(
    Date.UTC(requested.year, requested.month - 1, requested.day),
  );
  if (
    civilCheck.getUTCFullYear() !== requested.year ||
    civilCheck.getUTCMonth() + 1 !== requested.month ||
    civilCheck.getUTCDate() !== requested.day
  ) {
    return null;
  }

  const requestedAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    0,
    0,
  );
  let candidate = requestedAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = getBusinessDateTimeParts(candidate);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
      0,
    );
    const correction = requestedAsUtc - representedAsUtc;
    if (correction === 0) break;
    candidate += correction;
  }

  const result = new Date(candidate);
  const roundTrip = getBusinessDateTimeParts(result);
  const isExactRoundTrip =
    roundTrip.year === requested.year &&
    roundTrip.month === requested.month &&
    roundTrip.day === requested.day &&
    roundTrip.hour === requested.hour &&
    roundTrip.minute === requested.minute &&
    roundTrip.second === 0;

  return isExactRoundTrip ? result.toISOString() : null;
}

export function businessDateAtCurrentTimeToISOString(
  dateKey: string,
  submittedAt: DateInput = new Date(),
) {
  return businessDateTimeToISOString(
    dateKey,
    getBusinessTimeKey(submittedAt),
  );
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
