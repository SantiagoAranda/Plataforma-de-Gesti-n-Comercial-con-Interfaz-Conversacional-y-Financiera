import { jest } from '@jest/globals';
import { PublicService } from '../public/public.service';
import { ReservationsService } from '../reservations/reservations.service';
import { SalesService } from '../sales/sales.service';

export const BUSINESS_ID = 'business-1';
export const ITEM_ID = 'service-1';
export const OTHER_ITEM_ID = 'service-2';
// Anchor reservation used by the Sales route; CANCELLED so it never blocks anything.
export const ANCHOR_RESERVATION_ID = 'anchor-reservation';

export type Fixture = {
  durationMinutes: number | null;
  anchorDate?: string;
  anchorMinutes?: [number, number];
  windows: Array<{
    itemId: string | null;
    weekday: string;
    startMinute: number;
    endMinute: number;
  }>;
  blocks?: Array<{
    itemId?: string | null;
    date: string;
    startMinute: number | null;
    endMinute: number | null;
  }>;
  reservations?: Array<{
    id?: string;
    itemId?: string;
    date: string;
    startMinute: number;
    endMinute: number;
    status?: string;
  }>;
};

export const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

function matches(where: any, row: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return cond.some((c: any) => matches(c, row));
    if (key === 'AND') return cond.every((c: any) => matches(c, row));
    const value = row[key];
    if (cond instanceof Date) return value?.getTime() === cond.getTime();
    if (cond !== null && typeof cond === 'object') {
      const v = value instanceof Date ? value.getTime() : value;
      const n = (x: any) => (x instanceof Date ? x.getTime() : x);
      if ('not' in cond && v === n(cond.not)) return false;
      if ('gte' in cond && !(v >= n(cond.gte))) return false;
      if ('lte' in cond && !(v <= n(cond.lte))) return false;
      if ('gt' in cond && !(v > n(cond.gt))) return false;
      if ('lt' in cond && !(v < n(cond.lt))) return false;
      return true;
    }
    return value === cond;
  });
}

/** In-memory Prisma double that answers both legacy and unified availability queries. */
export function createFakePrisma(fixture: Fixture) {
  const item = {
    id: ITEM_ID,
    businessId: BUSINESS_ID,
    type: 'SERVICE',
    status: 'ACTIVE',
    durationMinutes: fixture.durationMinutes,
  };
  const windows = fixture.windows.map((w, i) => ({
    id: `w-${i}`,
    businessId: BUSINESS_ID,
    ...w,
  }));
  const blocks = (fixture.blocks ?? []).map((b, i) => ({
    id: `b-${i}`,
    businessId: BUSINESS_ID,
    itemId: b.itemId ?? null,
    startMinute: b.startMinute,
    endMinute: b.endMinute,
    date: day(b.date),
  }));
  const reservations = (fixture.reservations ?? []).map((r, i) => ({
    id: r.id ?? `r-${i}`,
    businessId: BUSINESS_ID,
    itemId: r.itemId ?? ITEM_ID,
    status: r.status ?? 'CONFIRMED',
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    date: day(r.date),
  }));
  const anchor = {
    id: ANCHOR_RESERVATION_ID,
    businessId: BUSINESS_ID,
    itemId: ITEM_ID,
    status: 'CANCELLED',
    date: day(fixture.anchorDate ?? '2000-01-01'),
    startMinute: fixture.anchorMinutes?.[0] ?? 0,
    endMinute: fixture.anchorMinutes?.[1] ?? 60,
    item,
  };
  const sortByStart = (rows: any[], args: any) =>
    args?.orderBy?.startMinute
      ? [...rows].sort((a, b) => a.startMinute - b.startMinute)
      : rows;

  const fake = (fn: (args: any) => unknown) =>
    jest.fn((args: any) => Promise.resolve(fn(args)));

  return {
    business: {
      findFirst: fake(() => ({ id: BUSINESS_ID, status: 'ACTIVE' })),
    },
    item: { findFirst: fake(() => item) },
    order: { findFirst: fake(() => null) },
    serviceScheduleWindow: {
      count: fake(
        (args) => windows.filter((w) => matches(args.where, w)).length,
      ),
      findMany: fake((args) =>
        sortByStart(
          windows.filter((w) => matches(args.where, w)),
          args,
        ),
      ),
    },
    serviceScheduleBlock: {
      findMany: fake((args) => blocks.filter((b) => matches(args.where, b))),
    },
    reservation: {
      findMany: fake((args) =>
        reservations.filter((r) => matches(args.where, r)),
      ),
      findFirst: fake((args) =>
        args?.include?.item
          ? anchor
          : (reservations.find((r) => matches(args.where, r)) ?? null),
      ),
    },
  } as any;
}

export function createRoutes(prisma: any) {
  const reservations = new ReservationsService(prisma);
  const publicStore = new PublicService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
  );
  const sales = new SalesService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return {
    reservations: {
      slots: (date: string) =>
        reservations.getAvailability(BUSINESS_ID, ITEM_ID, date),
      calendar: (month: string) =>
        reservations.getAvailabilityCalendar(BUSINESS_ID, ITEM_ID, month),
    },
    publicStore: {
      slots: (date: string) =>
        publicStore.getAvailability('demo', ITEM_ID, date),
      calendar: (month: string) =>
        publicStore.getAvailabilityCalendar('demo', ITEM_ID, month),
    },
    sales: {
      slots: (date: string) =>
        sales.getReservationAvailability(BUSINESS_ID, ANCHOR_RESERVATION_ID, {
          date,
        }),
      calendar: (month: string) =>
        sales.getReservationAvailability(BUSINESS_ID, ANCHOR_RESERVATION_ID, {
          month,
        }),
    },
  };
}

/** Freezes "now" as a Bogotá wall-clock time (UTC-5, no DST). */
export function freezeBogotaTime(isoLocal: string) {
  jest.useFakeTimers({
    now: new Date(`${isoLocal}-05:00`),
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
  });
}
