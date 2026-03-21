/**
 * Días de la semana en formato resumido para las cards.
 */
const COMPACT_DAYS: Record<string, string> = {
  MON: "L",
  TUE: "Ma",
  WED: "Mi",
  THU: "J",
  FRI: "V",
  SAT: "S",
  SUN: "D",
};

/**
 * Días de la semana en formato completo para los detalles.
 */
const FULL_DAYS: Record<string, string> = {
  MON: "Lunes",
  TUE: "Martes",
  WED: "Miércoles",
  THU: "Jueves",
  FRI: "Viernes",
  SAT: "Sábado",
  SUN: "Domingo",
};

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type ScheduleSlot = {
  weekday: string;
  startMinute: number;
  endMinute: number;
};

/**
 * Formatea los minutos desde medianoche a HH:mm
 */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Obtiene un string compacto de días activos (ej: "L, Ma, Mi") a partir del schedule.
 */
export function formatActiveDaysCompact(schedule: ScheduleSlot[] = []): string {
  if (!schedule || schedule.length === 0) return "";

  const activeDays = new Set(schedule.map((s) => s.weekday));
  
  return DAY_ORDER
    .filter((day) => activeDays.has(day))
    .map((day) => COMPACT_DAYS[day])
    .join(", ");
}

/**
 * Agrupa el schedule por día para mostrarlo en el detalle.
 */
export function groupScheduleByDay(schedule: ScheduleSlot[] = []) {
  if (!schedule || schedule.length === 0) return [];

  const groups: Record<string, { label: string, ranges: string[] }> = {};

  // Inicializar grupos en orden
  DAY_ORDER.forEach(day => {
    groups[day] = { label: FULL_DAYS[day], ranges: [] };
  });

  schedule.forEach(slot => {
    if (groups[slot.weekday]) {
      const range = `${minutesToTime(slot.startMinute)} - ${minutesToTime(slot.endMinute)}`;
      groups[slot.weekday].ranges.push(range);
    }
  });

  return DAY_ORDER
    .filter(day => groups[day].ranges.length > 0)
    .map(day => ({
      day,
      label: groups[day].label,
      ranges: groups[day].ranges
    }));
}
