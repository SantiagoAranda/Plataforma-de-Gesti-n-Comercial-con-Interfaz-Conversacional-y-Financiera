const FACTUS_DATE_TIME = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)$/i;

/**
 * Factus sends date-times without an offset in Colombia civil time.  Do not
 * use Date.parse/new Date(value): that format is implementation dependent.
 */
export function parseFactusDateTime(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null;
  const match = FACTUS_DATE_TIME.exec(value.trim());
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, secondText, meridiem] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour12 = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 || month > 12 || day < 1 || hour12 < 1 || hour12 > 12 ||
    minute > 59 || second > 59
  ) return null;

  const normalizedHour = meridiem.toUpperCase() === 'AM'
    ? hour12 % 12
    : (hour12 % 12) + 12;
  // Bogota is UTC-05:00 and does not observe DST. Construct the UTC instant
  // directly so results are independent from the host machine timezone.
  const result = new Date(Date.UTC(year, month - 1, day, normalizedHour + 5, minute, second));
  // Date.UTC normalizes impossible dates, so verify every calendar component.
  const bogota = new Date(result.getTime() - 5 * 60 * 60 * 1000);
  if (
    bogota.getUTCFullYear() !== year || bogota.getUTCMonth() !== month - 1 ||
    bogota.getUTCDate() !== day || bogota.getUTCHours() !== normalizedHour ||
    bogota.getUTCMinutes() !== minute || bogota.getUTCSeconds() !== second
  ) return null;
  return result;
}
