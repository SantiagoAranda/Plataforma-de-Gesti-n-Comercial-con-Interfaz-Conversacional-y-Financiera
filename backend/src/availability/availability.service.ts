import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export type MinuteRange = { startMinute: number; endMinute: number };
export type BlockRange = {
  startMinute: number | null;
  endMinute: number | null;
};

export type SlotQuery = {
  businessId: string;
  itemId: string;
  // Real length of the service: sizes each slot and drives overlap checks.
  durationMinutes?: number | null;
  // Spacing between possible starts. Null/invalid => legacy policy derived from duration.
  slotIntervalMinutes?: number | null;
  excludeReservationId?: string;
  // Sales edit flow: the reservation's own date keeps offering slots even if it is past.
  allowPastDateKey?: string;
};

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_DURATION_MINUTES = 60;
const DAY_MINUTES = 24 * 60;
const BUSINESS_TIME_ZONE = 'America/Bogota';
// Divisors of 60, so every grid lands on HH:00 and stays identical across routes.
export const ALLOWED_SLOT_INTERVALS = [5, 10, 15, 20, 30, 60];
// Legacy (pre-configurable) policy: largest clean subdivision of the hour within the duration.
const LEGACY_STEP_OPTIONS = [60, 30, 15, 5, 1];

export function resolveDuration(durationMinutes?: number | null) {
  return durationMinutes && durationMinutes > 0
    ? durationMinutes
    : DEFAULT_DURATION_MINUTES;
}

export function legacySlotInterval(durationMinutes: number) {
  return LEGACY_STEP_OPTIONS.find((step) => step <= durationMinutes) ?? 1;
}

export function resolveSlotInterval(
  durationMinutes?: number | null,
  slotIntervalMinutes?: number | null,
) {
  return slotIntervalMinutes != null &&
    ALLOWED_SLOT_INTERVALS.includes(slotIntervalMinutes)
    ? slotIntervalMinutes
    : legacySlotInterval(resolveDuration(durationMinutes));
}

export function formatSlotTime(minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

export function formatDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function mergeWindows(windows: MinuteRange[]): MinuteRange[] {
  const merged: MinuteRange[] = [];
  for (const window of [...windows].sort(
    (a, b) => a.startMinute - b.startMinute,
  )) {
    const last = merged[merged.length - 1];
    if (last && last.endMinute >= window.startMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else {
      merged.push({
        startMinute: window.startMinute,
        endMinute: window.endMinute,
      });
    }
  }
  return merged;
}

/** Pure slot calculation for one day. Returns "HH:MM" start times. */
export function computeSlots(input: {
  windows: MinuteRange[];
  blocks: BlockRange[];
  reservations: MinuteRange[];
  durationMinutes?: number | null;
  slotIntervalMinutes?: number | null;
  notBeforeMinute?: number;
}): string[] {
  const duration = resolveDuration(input.durationMinutes);
  const step = resolveSlotInterval(duration, input.slotIntervalMinutes);
  const slots: string[] = [];

  for (const window of mergeWindows(input.windows)) {
    for (
      let start = Math.ceil(window.startMinute / step) * step;
      start + duration <= window.endMinute;
      start += step
    ) {
      const end = start + duration;
      if (input.notBeforeMinute !== undefined && start < input.notBeforeMinute)
        continue;
      if (
        input.reservations.some(
          (r) => start < r.endMinute && end > r.startMinute,
        )
      )
        continue;
      // A missing bound extends the block to that edge of the day; null/null = whole day.
      if (
        input.blocks.some(
          (b) =>
            start < (b.endMinute ?? DAY_MINUTES) && end > (b.startMinute ?? 0),
        )
      )
        continue;
      slots.push(formatSlotTime(start));
    }
  }

  return slots;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  protected now() {
    return new Date();
  }

  private businessToday() {
    const now = new Date(
      this.now().toLocaleString('en-US', { timeZone: BUSINESS_TIME_ZONE }),
    );
    return {
      date: new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
      ),
      minute: now.getHours() * 60 + now.getMinutes(),
    };
  }

  async getSlots(query: SlotQuery & { date: Date }, db: Db = this.prisma) {
    const days = await this.computeRange(query, query.date, query.date, db);
    return days.get(formatDateKey(query.date)) ?? [];
  }

  /** Days of the month (UTC date-only) with at least one slot, as "YYYY-MM-DD". */
  async getAvailableDates(
    query: SlotQuery & { year: number; monthIndex: number },
    db: Db = this.prisma,
  ) {
    const from = new Date(Date.UTC(query.year, query.monthIndex, 1));
    const to = new Date(Date.UTC(query.year, query.monthIndex + 1, 0));
    const days = await this.computeRange(query, from, to, db);
    return [...days]
      .filter(([, slots]) => slots.length > 0)
      .map(([key]) => key);
  }

  findOverlappingReservation(
    query: {
      businessId: string;
      itemId: string;
      date: Date;
      startMinute: number;
      endMinute: number;
      excludeReservationId?: string;
    },
    db: Db = this.prisma,
  ) {
    return db.reservation.findFirst({
      where: {
        businessId: query.businessId,
        itemId: query.itemId,
        date: query.date,
        status: { not: 'CANCELLED' },
        ...(query.excludeReservationId
          ? { id: { not: query.excludeReservationId } }
          : {}),
        AND: [
          { startMinute: { lt: query.endMinute } },
          { endMinute: { gt: query.startMinute } },
        ],
      },
    });
  }

  async assertNoOverlap(
    query: Parameters<AvailabilityService['findOverlappingReservation']>[0],
    db: Db = this.prisma,
  ) {
    if (await this.findOverlappingReservation(query, db)) {
      throw new BadRequestException('Time slot already booked');
    }
  }

  private async computeRange(
    query: SlotQuery,
    from: Date,
    to: Date,
    db: Db,
  ): Promise<Map<string, string[]>> {
    const today = this.businessToday();
    const [windows, blocks, reservations] = await Promise.all([
      db.serviceScheduleWindow.findMany({
        where: {
          businessId: query.businessId,
          OR: [{ itemId: query.itemId }, { itemId: null }],
        },
        select: {
          itemId: true,
          weekday: true,
          startMinute: true,
          endMinute: true,
        },
      }),
      db.serviceScheduleBlock.findMany({
        where: {
          businessId: query.businessId,
          date: { gte: from, lte: to },
          OR: [{ itemId: query.itemId }, { itemId: null }],
        },
        select: { date: true, startMinute: true, endMinute: true },
      }),
      db.reservation.findMany({
        where: {
          businessId: query.businessId,
          itemId: query.itemId,
          date: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          ...(query.excludeReservationId
            ? { id: { not: query.excludeReservationId } }
            : {}),
        },
        select: { date: true, startMinute: true, endMinute: true },
      }),
    ]);

    // Any service-specific window replaces the general business schedule entirely.
    const specific = windows.filter((w) => w.itemId === query.itemId);
    const effective =
      specific.length > 0 ? specific : windows.filter((w) => w.itemId === null);

    const result = new Map<string, string[]>();
    for (
      const day = new Date(from);
      day <= to;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const key = formatDateKey(day);
      const allowPast = key === query.allowPastDateKey;
      if (!allowPast && day < today.date) {
        result.set(key, []);
        continue;
      }
      const sameDay = (d: Date) => d.getTime() === day.getTime();
      result.set(
        key,
        computeSlots({
          windows: effective.filter(
            (w) => w.weekday === WEEKDAYS[day.getUTCDay()],
          ),
          blocks: blocks.filter((b) => sameDay(b.date)),
          reservations: reservations.filter((r) => sameDay(r.date)),
          durationMinutes: query.durationMinutes,
          slotIntervalMinutes: query.slotIntervalMinutes,
          notBeforeMinute:
            !allowPast && day.getTime() === today.date.getTime()
              ? today.minute
              : undefined,
        }),
      );
    }
    return result;
  }
}
