import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Weekday } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertAppointmentService, lockItemConfiguration } from '../items/item-service-policy';

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

/** Identifies one agenda (resource + day) for transactional locking. */
export type AgendaKey = { businessId: string; itemId: string; date: Date };

export type ReserveSlotInput = {
  businessId: string;
  itemId: string;
  date: string | Date;
  startMinute: number;
  // Client-provided end; only checked for consistency, never trusted.
  requestedEndMinute?: number | null;
  excludeReservationId?: string;
  // Existing reservations of a now-inactive service may still be rescheduled.
  allowInactiveService?: boolean;
  // Other agendas the operation touches (e.g. the source day of a reschedule).
  extraLockKeys?: AgendaKey[];
  // Authenticated manual sales only (retrospective registration). Never set by public flows.
  allowPast?: boolean;
  historicalDurationMinutes?: number;
};

export type SlotIssue = 'OUTSIDE_SCHEDULE' | 'OFF_GRID' | 'BLOCKED' | 'OVERLAP';

export const RESERVATION_ERRORS = {
  serviceNotFound: 'El servicio no existe o no está disponible.',
  notAService: 'El ítem seleccionado no es un servicio.',
  serviceInactive: 'El servicio no está disponible para nuevas reservas.',
  invalidDuration: 'La duración del servicio no es válida.',
  invalidDate: 'La fecha de la reserva no es válida.',
  invalidStart: 'El horario de inicio no es válido.',
  outsideSchedule: 'El turno supera el horario de atención configurado.',
  offGrid: 'El horario no coincide con los intervalos de inicio permitidos.',
  past: 'No se pueden reservar horarios anteriores al momento actual.',
  unavailable: 'El horario seleccionado ya no está disponible.',
  notFound: 'Reserva no encontrada',
  linkedToSale:
    'Esta reserva está vinculada a una venta. Cancelala desde Ventas.',
  confirmedCancelRequiresSales:
    'Las reservas confirmadas solo se pueden cancelar desde Ventas.',
  publicCancelNotAllowed:
    'Esta reserva ya está confirmada. Contactá al negocio para cancelarla.',
  publicCancelUnauthorized:
    'El enlace no permite cancelar esta reserva. Usá el enlace que recibiste al reservar o contactá al negocio.',
  cancelledCannotConfirm: 'Una reserva cancelada no se puede confirmar.',
  notPendingConfirm: 'Solo se pueden confirmar reservas pendientes.',
} as const;

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_MINUTES = 24 * 60;
// Fallback for Colombian businesses; Business has no time-zone field yet.
const DEFAULT_BUSINESS_TIME_ZONE = 'America/Bogota';
const AGENDA_LOCK_TIMEOUT = '5s';
// Divisors of 60, so every grid lands on HH:00 and stays identical across routes.
export const ALLOWED_SLOT_INTERVALS = [5, 10, 15, 20, 30, 60];
// Legacy (pre-configurable) policy: largest clean subdivision of the hour within the duration.
const LEGACY_STEP_OPTIONS = [60, 30, 15, 5, 1];

export function isValidDuration(
  durationMinutes?: number | null,
): durationMinutes is number {
  return (
    typeof durationMinutes === 'number' &&
    Number.isInteger(durationMinutes) &&
    durationMinutes > 0 &&
    durationMinutes <= DAY_MINUTES
  );
}

export function legacySlotInterval(durationMinutes: number) {
  return LEGACY_STEP_OPTIONS.find((step) => step <= durationMinutes) ?? 1;
}

export function resolveSlotInterval(
  durationMinutes: number,
  slotIntervalMinutes?: number | null,
) {
  return slotIntervalMinutes != null &&
    ALLOWED_SLOT_INTERVALS.includes(slotIntervalMinutes)
    ? slotIntervalMinutes
    : legacySlotInterval(durationMinutes);
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

export function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  // Rejects impossible dates such as 2026-02-31 that Date.UTC would roll over.
  return formatDateKey(date) === match[0] ? date : null;
}

export function agendaLockKey(key: AgendaKey) {
  // shortcut: one agenda per service; with shared groups the resource becomes `group:<id>`.
  return `sactec:agenda:${key.businessId}:item:${key.itemId}:${formatDateKey(key.date)}`;
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

function overlapsReservation(
  start: number,
  end: number,
  reservations: MinuteRange[],
) {
  return reservations.some((r) => start < r.endMinute && end > r.startMinute);
}

function isBlocked(start: number, end: number, blocks: BlockRange[]) {
  // A missing bound extends the block to that edge of the day; null/null = whole day.
  return blocks.some(
    (b) => start < (b.endMinute ?? DAY_MINUTES) && end > (b.startMinute ?? 0),
  );
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
  if (!isValidDuration(input.durationMinutes)) return [];
  const duration = input.durationMinutes;
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
      if (overlapsReservation(start, end, input.reservations)) continue;
      if (isBlocked(start, end, input.blocks)) continue;
      slots.push(formatSlotTime(start));
    }
  }

  return slots;
}

/** Pure check of one requested slot; null means it is bookable. */
export function evaluateSlot(input: {
  windows: MinuteRange[];
  blocks: BlockRange[];
  reservations: MinuteRange[];
  startMinute: number;
  durationMinutes: number;
  slotIntervalMinutes?: number | null;
}): SlotIssue | null {
  const start = input.startMinute;
  const end = start + input.durationMinutes;
  const fits = mergeWindows(input.windows).some(
    (w) => start >= w.startMinute && end <= w.endMinute,
  );
  if (!fits) return 'OUTSIDE_SCHEDULE';
  const step = resolveSlotInterval(
    input.durationMinutes,
    input.slotIntervalMinutes,
  );
  if (start % step !== 0) return 'OFF_GRID';
  if (isBlocked(start, end, input.blocks)) return 'BLOCKED';
  if (overlapsReservation(start, end, input.reservations)) return 'OVERLAP';
  return null;
}

/** Maps lock timeouts, deadlocks and the active-slot unique index to a 409. */
export function toBookingConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const rawCode = (error.meta as { code?: unknown } | undefined)?.code;
    const metaCode = typeof rawCode === 'string' ? rawCode : '';
    const isActiveSlotDuplicate =
      error.code === 'P2002' &&
      JSON.stringify(error.meta ?? {}).includes('startMinute');
    const isLockConflict =
      (error.code === 'P2010' && ['55P03', '40P01'].includes(metaCode)) ||
      error.code === 'P2034' ||
      /55P03|40P01|lock timeout/i.test(error.message);
    if (isActiveSlotDuplicate || isLockConflict) {
      return new ConflictException(RESERVATION_ERRORS.unavailable);
    }
  }
  return error;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  protected now() {
    return new Date();
  }

  // Single place to resolve a business time zone once Business stores one.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected businessTimeZone(_businessId: string) {
    return DEFAULT_BUSINESS_TIME_ZONE;
  }

  private businessToday(businessId: string) {
    const now = new Date(
      this.now().toLocaleString('en-US', {
        timeZone: this.businessTimeZone(businessId),
      }),
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

  /** Authenticated Sales only: historical starts are suggestions, not current availability. */
  async getManualSalesSlots(query: SlotQuery & { date: Date }, historicalDuration = query.durationMinutes) {
    const item = await this.prisma.item.findFirst({ where: { id: query.itemId, businessId: query.businessId }, select: { requiresAppointment: true } });
    if (item?.requiresAppointment === false) return [];
    const today = this.businessToday(query.businessId);
    const future = await this.getSlots(query);
    const slots = future.map(time => ({ time, kind: 'AVAILABLE' as 'AVAILABLE' | 'HISTORICAL' }));
    if (query.date > today.date) return slots;
    const duration = historicalDuration;
    if (!isValidDuration(duration)) throw new BadRequestException(RESERVATION_ERRORS.invalidDuration);
    const range = await this.loadRange(this.prisma, query, query.date, query.date);
    const limit = query.date < today.date ? DAY_MINUTES : today.minute;
    const historical = computeSlots({
      windows: range.windowsFor(query.date),
      blocks: range.blocksFor(query.date),
      reservations: range.reservationsFor(query.date),
      durationMinutes: duration,
      slotIntervalMinutes: query.slotIntervalMinutes,
    });
    // Current windows suggest convenient starts; they do not certify historical availability.
    for (const time of historical) {
      const [hour, minute] = time.split(':').map(Number);
      if (hour * 60 + minute < limit) slots.push({ time, kind: 'HISTORICAL' });
    }
    return slots.sort((a, b) => a.time.localeCompare(b.time));
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

  /**
   * Serializes every operation on the given agendas until the transaction ends.
   * Keys are deduplicated and sorted so concurrent callers never deadlock.
   */
  async lockAgenda(tx: Prisma.TransactionClient, keys: AgendaKey[]) {
    const ordered = [...new Set(keys.map(agendaLockKey))].sort();
    if (ordered.length === 0) return;
    await tx.$executeRawUnsafe(
      `SET LOCAL lock_timeout = '${AGENDA_LOCK_TIMEOUT}'`,
    );
    for (const key of ordered) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
  }

  /**
   * Row-locks an existing reservation. Lock order everywhere: reservation row first,
   * then agenda keys (sorted), so edits, reschedules and cancels cannot deadlock.
   */
  async lockReservationRow(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservationId: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Reservation" WHERE "id" = ${reservationId} AND "businessId" = ${businessId} FOR UPDATE`;
    return tx.reservation.findFirst({
      where: { id: reservationId, businessId },
    });
  }

  /**
   * Shared first step of every cancellation: row lock, 404, idempotent CANCELLED and
   * rejection of Sales mirrors (Reservation.id = Order.id), which are cancelled via the order.
   * Cancelling only frees capacity, so no agenda lock is needed (the partial index and
   * the creators' agenda locks keep a re-booked slot single-occupied).
   */
  async lockReservationForCancellation(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservationId: string,
  ) {
    const reservation = await this.lockReservationRow(
      tx,
      businessId,
      reservationId,
    );
    if (!reservation) throw new NotFoundException(RESERVATION_ERRORS.notFound);
    if (reservation.status === 'CANCELLED') {
      return { reservation, alreadyCancelled: true };
    }
    await this.assertNotSalesMirror(tx, businessId, reservationId);
    return { reservation, alreadyCancelled: false };
  }

  /** A reservation sharing its id with an Order is that order's mirror. */
  async assertNotSalesMirror(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservationId: string,
  ) {
    const order = await tx.order.findFirst({
      where: { id: reservationId, businessId },
      select: { id: true },
    });
    if (order) throw new ConflictException(RESERVATION_ERRORS.linkedToSale);
  }

  /**
   * Validates a new or moved reservation and locks its agenda. Must run inside the
   * same transaction that writes the reservation; the lock is held until commit.
   */
  async reserveSlot(tx: Prisma.TransactionClient, input: ReserveSlotInput) {
    await lockItemConfiguration(tx, input.businessId, [input.itemId]);
    const item = await tx.item.findFirst({
      where: { id: input.itemId, businessId: input.businessId },
      select: { id: true, type: true, status: true, durationMinutes: true, requiresAppointment: true },
    });
    if (!item) throw new NotFoundException(RESERVATION_ERRORS.serviceNotFound);
    if (item.type !== 'SERVICE') {
      throw new BadRequestException(RESERVATION_ERRORS.notAService);
    }
    assertAppointmentService(item);
    if (item.status !== 'ACTIVE' && !input.allowInactiveService) {
      throw new BadRequestException(RESERVATION_ERRORS.serviceInactive);
    }
    const durationMinutes = input.allowPast && input.historicalDurationMinutes != null ? input.historicalDurationMinutes : item.durationMinutes;
    if (!isValidDuration(durationMinutes)) {
      throw new BadRequestException(RESERVATION_ERRORS.invalidDuration);
    }

    const date =
      input.date instanceof Date ? input.date : parseDateKey(input.date);
    if (!date || Number.isNaN(date.getTime())) {
      throw new BadRequestException(RESERVATION_ERRORS.invalidDate);
    }
    const startMinute = input.startMinute;
    if (
      !Number.isInteger(startMinute) ||
      startMinute < 0 ||
      startMinute >= DAY_MINUTES
    ) {
      throw new BadRequestException(RESERVATION_ERRORS.invalidStart);
    }
    const endMinute = startMinute + durationMinutes;
    if (endMinute > DAY_MINUTES) {
      throw new BadRequestException(RESERVATION_ERRORS.outsideSchedule);
    }
    if (
      input.requestedEndMinute != null &&
      input.requestedEndMinute !== endMinute
    ) {
      throw new ConflictException(RESERVATION_ERRORS.unavailable);
    }

    const today = this.businessToday(input.businessId);
    const isPast =
      date < today.date ||
      (date.getTime() === today.date.getTime() && startMinute < today.minute);
    if (isPast && !input.allowPast) {
      throw new BadRequestException(RESERVATION_ERRORS.past);
    }

    if (input.historicalDurationMinutes != null && (!input.allowPast || !isPast || date.getTime() === today.date.getTime() && endMinute > today.minute)) {
      throw new BadRequestException({ code: 'RESERVATION_NOT_ENDED', message: 'La duración real solo se puede indicar para una atención ya terminada.' });
    }

    await this.lockAgenda(tx, [
      { businessId: input.businessId, itemId: item.id, date },
      ...(input.extraLockKeys ?? []),
    ]);

    // Read after the lock so concurrent writers on this agenda are already committed.
    const day = await this.loadRange(
      tx,
      {
        businessId: input.businessId,
        itemId: item.id,
        excludeReservationId: input.excludeReservationId,
      },
      date,
      date,
    );
    // Today's schedule may not match the historical one: a past start only has to be
    // free of blocks and other bookings (which also rejects a duplicate registration).
    const issue = isPast
      ? isBlocked(startMinute, endMinute, day.blocksFor(date))
        ? 'BLOCKED'
        : overlapsReservation(startMinute, endMinute, day.reservationsFor(date))
          ? 'OVERLAP'
          : null
      : evaluateSlot({
      windows: day.windowsFor(date),
      blocks: day.blocksFor(date),
      reservations: day.reservationsFor(date),
      startMinute,
      durationMinutes,
    });
    if (issue === 'OUTSIDE_SCHEDULE') {
      throw new BadRequestException(RESERVATION_ERRORS.outsideSchedule);
    }
    if (issue === 'OFF_GRID') {
      throw new BadRequestException(RESERVATION_ERRORS.offGrid);
    }
    if (issue) throw new ConflictException(RESERVATION_ERRORS.unavailable);

    return {
      itemId: item.id,
      date,
      startMinute,
      endMinute,
      durationMinutes,
    };
  }

  private async loadRange(
    db: Db,
    query: Pick<SlotQuery, 'businessId' | 'itemId' | 'excludeReservationId'>,
    from: Date,
    to: Date,
  ) {
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
    const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

    return {
      windowsFor: (day: Date) =>
        effective.filter((w) => w.weekday === WEEKDAYS[day.getUTCDay()]),
      blocksFor: (day: Date) => blocks.filter((b) => sameDay(b.date, day)),
      reservationsFor: (day: Date) =>
        reservations.filter((r) => sameDay(r.date, day)),
    };
  }

  private async computeRange(
    query: SlotQuery,
    from: Date,
    to: Date,
    db: Db,
  ): Promise<Map<string, string[]>> {
    const item = await db.item.findFirst({ where: { id: query.itemId, businessId: query.businessId }, select: { requiresAppointment: true } });
    if (item?.requiresAppointment === false) return new Map();
    const today = this.businessToday(query.businessId);
    const range = await this.loadRange(db, query, from, to);

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
      result.set(
        key,
        computeSlots({
          windows: range.windowsFor(day),
          blocks: range.blocksFor(day),
          reservations: range.reservationsFor(day),
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
