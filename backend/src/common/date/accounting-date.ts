const BUSINESS_TIME_ZONE = 'America/Bogota';

type CivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function dateTimeParts(value: Date): CivilDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((candidate) => candidate.type === type)?.value;
    if (part === undefined) throw new Error(`Missing date part: ${type}`);
    return Number(part);
  };

  return {
    year: numberPart('year'),
    month: numberPart('month'),
    day: numberPart('day'),
    hour: numberPart('hour'),
    minute: numberPart('minute'),
    second: numberPart('second'),
  };
}

export function businessDateAtCurrentTime(
  dateKey: string,
  confirmedAt: Date = new Date(),
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!dateMatch || Number.isNaN(confirmedAt.getTime())) return null;

  const current = dateTimeParts(confirmedAt);
  const requested: CivilDateTime = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: current.hour,
    minute: current.minute,
    second: current.second,
  };
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
    requested.second,
  );
  let candidate = requestedAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = dateTimeParts(new Date(candidate));
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    const correction = requestedAsUtc - representedAsUtc;
    if (correction === 0) break;
    candidate += correction;
  }

  const result = new Date(candidate);
  const roundTrip = dateTimeParts(result);
  return Object.keys(requested).every(
    (key) =>
      roundTrip[key as keyof CivilDateTime] ===
      requested[key as keyof CivilDateTime],
  )
    ? result
    : null;
}

/** Preserves full instants and gives legacy YYYY-MM-DD inputs Colombian civil semantics. */
export function parseAccountingDate(
  value: string | Date,
  confirmedAt: Date = new Date(),
): Date | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return businessDateAtCurrentTime(value, confirmedAt);
  }

  const parsed =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
