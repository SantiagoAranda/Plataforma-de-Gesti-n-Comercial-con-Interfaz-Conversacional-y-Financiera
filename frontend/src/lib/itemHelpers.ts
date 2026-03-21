import { WeeklySchedule } from "../types/item";

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);

  return aS < bE && bS < aE;
}

export function formatPriceInput(input: string) {
  // Remove non-numeric except comma
  let cleanValue = input.replace(/[^0-9,]/g, "");
  
  // Handle multiple commas
  const parts = cleanValue.split(",");
  if (parts.length > 2) {
    cleanValue = parts[0] + "," + parts.slice(1).join("");
  }
  
  // Thousands separator with dot
  const [integerPart, decimalPart] = cleanValue.split(",");
  const formattedInteger = integerPart?.replace(/\B(?=(\d{3})+(?!\d))/g, ".") ?? "";
  
  return decimalPart !== undefined ? `${formattedInteger},${decimalPart.slice(0, 2)}` : formattedInteger;
}

export function parsePriceInput(formatted: string) {
  return formatted.replace(/\./g, "").replace(",", ".");
}

export function generateCreationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export const WEEKDAY_ENUM = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const INITIAL_WEEK: WeeklySchedule[] = [
  { day: "Lunes", active: true, ranges: [{ start: "08:00", end: "12:00" }] },
  { day: "Martes", active: false, ranges: [] },
  { day: "Miércoles", active: false, ranges: [] },
  { day: "Jueves", active: false, ranges: [] },
  { day: "Viernes", active: false, ranges: [] },
  { day: "Sábado", active: false, ranges: [] },
  { day: "Domingo", active: false, ranges: [] },
];

export function createInitialWeek(): WeeklySchedule[] {
  return INITIAL_WEEK.map((day) => ({
    ...day,
    ranges: day.ranges.map((range) => ({ ...range })),
  }));
}
