import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PublicService } from '../public/public.service';
import { ReservationsService } from '../reservations/reservations.service';
import { SalesService } from '../sales/sales.service';
import {
  agendaLockKey,
  AvailabilityService,
  evaluateSlot,
  parseDateKey,
  RESERVATION_ERRORS as E,
  toBookingConflict,
} from './availability.service';
import {
  BUSINESS_ID,
  createFakePrisma,
  day,
  Fixture,
  freezeBogotaTime,
  ITEM_ID,
} from './availability.test-utils';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
// "Now" is frozen at Tuesday 2026-11-10 10:20 (Bogotá).
const TODAY = '2026-11-10';
const FUTURE = '2026-11-16';
const PAST = '2026-11-02';
const H = (h: number, m = 0) => h * 60 + m;
const win = (start: number, end: number, date = FUTURE) => ({
  itemId: ITEM_ID,
  weekday: WEEKDAYS[day(date).getUTCDay()],
  startMinute: start,
  endMinute: end,
});
const base: Fixture = { durationMinutes: 60, windows: [win(H(9), H(13))] };

beforeEach(() => freezeBogotaTime(`${TODAY}T10:20:00`));
afterEach(() => jest.useRealTimers());

function reservations(fixture: Partial<Fixture> = {}) {
  const prisma = createFakePrisma({ ...base, ...fixture });
  return { prisma, service: new ReservationsService(prisma) };
}

const create = (
  fixture: Partial<Fixture>,
  dto: Partial<{
    itemId: string;
    date: string;
    startMinute: number;
    endMinute: number;
  }> = {},
) => {
  const { prisma, service } = reservations(fixture);
  return {
    prisma,
    result: service.create(BUSINESS_ID, {
      itemId: ITEM_ID,
      date: FUTURE,
      startMinute: H(10),
      ...dto,
    } as any),
  };
};

describe('Validación centralizada (reserveSlot)', () => {
  it('reserva dentro del horario: fin calculado con la duración real', async () => {
    const { prisma, result } = create({});
    await expect(result).resolves.toEqual(
      expect.objectContaining({ startMinute: H(10), endMinute: H(11) }),
    );
    expect(prisma.reservations).toHaveLength(1);
  });

  it('toma el lock de agenda antes de leer reservas y de escribir', async () => {
    const { prisma, result } = create({});
    await result;
    const lockAt = prisma.$executeRaw.mock.invocationCallOrder[0];
    expect(lockAt).toBeLessThan(
      prisma.reservation.findMany.mock.invocationCallOrder[0],
    );
    expect(lockAt).toBeLessThan(
      prisma.reservation.create.mock.invocationCallOrder[0],
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL lock_timeout = '5s'",
    );
  });

  it.each([
    [
      'fuera del horario',
      {},
      { startMinute: H(14) },
      BadRequestException,
      E.outsideSchedule,
    ],
    [
      'termina después del cierre',
      { durationMinutes: 90 },
      { startMinute: H(12) },
      BadRequestException,
      E.outsideSchedule,
    ],
    [
      'supera el fin del día',
      { durationMinutes: 120, windows: [win(H(22), H(24))] },
      { startMinute: H(23) },
      BadRequestException,
      E.outsideSchedule,
    ],
    [
      'fuera de la grilla de inicios',
      {},
      { startMinute: H(10, 30) },
      BadRequestException,
      E.offGrid,
    ],
    [
      'bloqueo parcial',
      { blocks: [{ date: FUTURE, startMinute: H(10, 30), endMinute: H(11) }] },
      {},
      ConflictException,
      E.unavailable,
    ],
    [
      'día bloqueado',
      { blocks: [{ date: FUTURE, startMinute: null, endMinute: null }] },
      {},
      ConflictException,
      E.unavailable,
    ],
    [
      'duración cero',
      { durationMinutes: 0 },
      {},
      BadRequestException,
      E.invalidDuration,
    ],
    [
      'duración nula',
      { durationMinutes: null },
      {},
      BadRequestException,
      E.invalidDuration,
    ],
    [
      'fecha pasada',
      { windows: [win(H(9), H(13), PAST)] },
      { date: PAST },
      BadRequestException,
      E.past,
    ],
    [
      'hora pasada de hoy',
      { windows: [win(H(9), H(13), TODAY)] },
      { date: TODAY, startMinute: H(10) },
      BadRequestException,
      E.past,
    ],
    [
      'fecha imposible',
      {},
      { date: '2026-02-31' },
      BadRequestException,
      E.invalidDate,
    ],
    [
      'inicio inválido',
      {},
      { startMinute: 1500 },
      BadRequestException,
      E.invalidStart,
    ],
    [
      'endMinute manipulado',
      {},
      { endMinute: H(12) },
      ConflictException,
      E.unavailable,
    ],
    [
      'servicio inexistente',
      {},
      { itemId: 'missing' },
      NotFoundException,
      E.serviceNotFound,
    ],
    [
      'servicio de otro negocio',
      {
        extraItems: [
          {
            id: 'foreign',
            businessId: 'other',
            type: 'SERVICE',
            status: 'ACTIVE',
            durationMinutes: 60,
          },
        ],
      },
      { itemId: 'foreign' },
      NotFoundException,
      E.serviceNotFound,
    ],
    [
      'servicio inactivo',
      { itemStatus: 'INACTIVE' },
      {},
      BadRequestException,
      E.serviceInactive,
    ],
    [
      'ítem que no es servicio',
      { itemType: 'PRODUCT' },
      {},
      BadRequestException,
      E.notAService,
    ],
  ] as const)('%s', async (_name, fixture, dto, errorType, message) => {
    const { prisma, result } = create(fixture as any, dto as any);
    await expect(result).rejects.toThrow(new (errorType as any)(message));
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('acepta endMinute coherente con la duración', async () => {
    const { result } = create({}, { endMinute: H(11) });
    await expect(result).resolves.toEqual(
      expect.objectContaining({ endMinute: H(11) }),
    );
  });

  it('hora de hoy todavía futura se acepta', async () => {
    const { result } = create(
      { windows: [win(H(9), H(13), TODAY)] },
      { date: TODAY, startMinute: H(11) },
    );
    await expect(result).resolves.toBeDefined();
  });
});

describe('Solapamientos', () => {
  const existing = (
    startMinute: number,
    endMinute: number,
    status = 'CONFIRMED',
  ) => ({
    reservations: [{ id: 'r-1', date: FUTURE, startMinute, endMinute, status }],
  });

  it('mismo inicio → 409', async () => {
    const { result } = create(existing(H(10), H(11)));
    await expect(result).rejects.toThrow(new ConflictException(E.unavailable));
  });

  it('distinto inicio con solapamiento → 409', async () => {
    const { result } = create({
      durationMinutes: 90,
      ...existing(H(9), H(10, 30)),
    });
    await expect(result).rejects.toThrow(new ConflictException(E.unavailable));
  });

  it('reservas consecutivas no se bloquean', async () => {
    const { result } = create(existing(H(9), H(10)));
    await expect(result).resolves.toBeDefined();
  });

  it('una reserva cancelada no bloquea el mismo inicio', async () => {
    const { result } = create(existing(H(10), H(11), 'CANCELLED'));
    await expect(result).resolves.toBeDefined();
  });
});

describe('Reprogramación (Reservas)', () => {
  const pending = (date: string, start: number, end: number) => ({
    id: 'r-1',
    date,
    startMinute: start,
    endMinute: end,
    status: 'PENDING',
  });

  it('excluye la propia reserva del control de solapamiento', async () => {
    const { service } = reservations({
      durationMinutes: 90,
      reservations: [pending(FUTURE, H(9), H(10, 30))],
    });
    await expect(
      service.reschedule(BUSINESS_ID, 'r-1', {
        date: FUTURE,
        startMinute: H(10),
        endMinute: H(11, 30),
      }),
    ).resolves.toEqual(
      expect.objectContaining({ startMinute: H(10), endMinute: H(11, 30) }),
    );
  });

  it('hacia un intervalo ocupado → 409', async () => {
    const { service } = reservations({
      reservations: [
        pending(FUTURE, H(9), H(10)),
        { id: 'r-2', date: FUTURE, startMinute: H(11), endMinute: H(12) },
      ],
    });
    await expect(
      service.reschedule(BUSINESS_ID, 'r-1', {
        date: FUTURE,
        startMinute: H(11),
        endMinute: H(12),
      }),
    ).rejects.toThrow(new ConflictException(E.unavailable));
  });

  it('sin cambio de horario no revalida (turno histórico pasado se conserva)', async () => {
    const { prisma, service } = reservations({
      windows: [],
      reservations: [pending(PAST, H(9), H(9, 45))],
    });
    await expect(
      service.reschedule(BUSINESS_ID, 'r-1', {
        date: PAST,
        startMinute: H(9),
        endMinute: H(10),
      }),
    ).resolves.toEqual(
      expect.objectContaining({ startMinute: H(9), endMinute: H(9, 45) }),
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });

  it('permite mover reservas de un servicio inactivo (regla previa)', async () => {
    const { service } = reservations({
      itemStatus: 'INACTIVE',
      reservations: [pending(FUTURE, H(9), H(10))],
    });
    await expect(
      service.reschedule(BUSINESS_ID, 'r-1', {
        date: FUTURE,
        startMinute: H(11),
        endMinute: H(12),
      }),
    ).resolves.toEqual(expect.objectContaining({ startMinute: H(11) }));
  });

  it('bloquea fila y luego agendas origen y destino en orden determinista', async () => {
    const NEXT = '2026-11-23';
    const { prisma, service } = reservations({
      windows: [win(H(9), H(13)), win(H(9), H(13), NEXT)],
      reservations: [pending(NEXT, H(9), H(10))],
    });
    await service.reschedule(BUSINESS_ID, 'r-1', {
      date: FUTURE,
      startMinute: H(11),
      endMinute: H(12),
    });

    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$executeRaw.mock.invocationCallOrder[0],
    );
    const lockedKeys = prisma.$executeRaw.mock.calls.map(
      (call: any[]) => call[1],
    );
    const expected = [FUTURE, NEXT]
      .map((d) =>
        agendaLockKey({
          businessId: BUSINESS_ID,
          itemId: ITEM_ID,
          date: day(d),
        }),
      )
      .sort();
    expect(lockedKeys).toEqual(expected);
  });

  it('no reprograma reservas que no están PENDING (regla previa)', async () => {
    const { service } = reservations({
      reservations: [{ ...pending(FUTURE, H(9), H(10)), status: 'CANCELLED' }],
    });
    await expect(
      service.reschedule(BUSINESS_ID, 'r-1', {
        date: FUTURE,
        startMinute: H(11),
        endMinute: H(12),
      }),
    ).rejects.toThrow('Solo se pueden reprogramar reservas pendientes.');
  });
});

describe('Tienda pública', () => {
  const store = (fixture: Partial<Fixture> = {}) => {
    const prisma = createFakePrisma({ ...base, ...fixture });
    return {
      prisma,
      service: new PublicService(prisma, {} as any, {} as any, {} as any),
    };
  };
  const dto = (overrides: Record<string, unknown> = {}) => ({
    itemId: ITEM_ID,
    customerName: 'Ana',
    customerWhatsapp: '573001112233',
    date: FUTURE,
    startMinute: H(10),
    ...overrides,
  });

  it('crea la reserva con fin calculado y origen PUBLIC_STORE', async () => {
    const { service } = store();
    await expect(
      service.createReservation('demo', dto() as any),
    ).resolves.toEqual(
      expect.objectContaining({
        endMinute: H(11),
        origin: 'PUBLIC_STORE',
        status: 'PENDING',
      }),
    );
  });

  it('rechaza endMinute manipulado', async () => {
    const { prisma, service } = store();
    await expect(
      service.createReservation('demo', dto({ endMinute: H(13) }) as any),
    ).rejects.toThrow(new ConflictException(E.unavailable));
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });
});

describe('Edición desde Ventas (sourceType RESERVATION)', () => {
  const sales = (fixture: Partial<Fixture>) => {
    const prisma = createFakePrisma({ ...base, ...fixture });
    return {
      prisma,
      service: new SalesService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      ),
    };
  };
  const pending = (date: string, start: number, end: number) => ({
    id: 'r-1',
    date,
    startMinute: start,
    endMinute: end,
    status: 'PENDING',
  });
  // update() maps the reservation through its item; the fake returns rows without it.
  const withItem = (prisma: any) => {
    const original = prisma.reservation.update.getMockImplementation();
    prisma.reservation.update.mockImplementation(async (args: any) => ({
      ...(await original(args)),
      item: {
        name: 'Corte',
        price: new Prisma.Decimal(1000),
        durationMinutes: 60,
      },
    }));
  };

  it('cambios administrativos sin cambio de turno no revalidan (reserva pasada)', async () => {
    const { prisma, service } = sales({
      windows: [],
      reservations: [pending(PAST, H(9), H(9, 45))],
    });
    withItem(prisma);
    await service.update(
      BUSINESS_ID,
      'r-1',
      { customerName: 'Nuevo', scheduledAt: `${PAST}T09:00` } as any,
      'RESERVATION',
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.reservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ startMinute: expect.anything() }),
      }),
    );
    expect(prisma.reservations[0]).toEqual(
      expect.objectContaining({
        customerName: 'Nuevo',
        startMinute: H(9),
        endMinute: H(9, 45),
      }),
    );
  });

  it('cambio de turno a un horario libre usa la duración del servicio', async () => {
    const { prisma, service } = sales({
      reservations: [pending(FUTURE, H(9), H(10))],
    });
    withItem(prisma);
    await service.update(
      BUSINESS_ID,
      'r-1',
      { scheduledAt: `${FUTURE}T11:00` } as any,
      'RESERVATION',
    );
    expect(prisma.reservations[0]).toEqual(
      expect.objectContaining({ startMinute: H(11), endMinute: H(12) }),
    );
  });

  it('cambio de turno a un horario ocupado → 409 y no escribe', async () => {
    const { prisma, service } = sales({
      reservations: [
        pending(FUTURE, H(9), H(10)),
        { id: 'r-2', date: FUTURE, startMinute: H(11), endMinute: H(12) },
      ],
    });
    await expect(
      service.update(
        BUSINESS_ID,
        'r-1',
        { scheduledAt: `${FUTURE}T11:00` } as any,
        'RESERVATION',
      ),
    ).rejects.toThrow(new ConflictException(E.unavailable));
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });

  it('no edita reservas confirmadas (regla previa)', async () => {
    const { service } = sales({
      reservations: [{ ...pending(FUTURE, H(9), H(10)), status: 'CONFIRMED' }],
    });
    await expect(
      service.update(
        BUSINESS_ID,
        'r-1',
        { customerName: 'X' } as any,
        'RESERVATION',
      ),
    ).rejects.toThrow('Reservation not editable in current status');
  });
});

describe('Primitivas', () => {
  it('evaluateSlot clasifica cada motivo', () => {
    const args = {
      windows: [{ startMinute: H(9), endMinute: H(12) }],
      blocks: [],
      reservations: [],
      durationMinutes: 60,
    };
    expect(evaluateSlot({ ...args, startMinute: H(9) })).toBeNull();
    expect(evaluateSlot({ ...args, startMinute: H(11, 30) })).toBe(
      'OUTSIDE_SCHEDULE',
    );
    expect(evaluateSlot({ ...args, startMinute: H(9, 15) })).toBe('OFF_GRID');
    expect(
      evaluateSlot({
        ...args,
        startMinute: H(9),
        blocks: [{ startMinute: H(9), endMinute: H(9, 30) }],
      }),
    ).toBe('BLOCKED');
    expect(
      evaluateSlot({
        ...args,
        startMinute: H(9),
        reservations: [{ startMinute: H(9, 30), endMinute: H(10) }],
      }),
    ).toBe('OVERLAP');
  });

  it('parseDateKey rechaza fechas imposibles', () => {
    expect(parseDateKey('2026-02-28')).toEqual(day('2026-02-28'));
    expect(parseDateKey('2026-02-31')).toBeNull();
    expect(parseDateKey('16/11/2026')).toBeNull();
  });

  it('lockAgenda deduplica y ordena las claves', async () => {
    const prisma = createFakePrisma(base);
    const keys = ['2026-11-30', '2026-11-16', '2026-11-30'].map((d) => ({
      businessId: BUSINESS_ID,
      itemId: ITEM_ID,
      date: day(d),
    }));
    await new AvailabilityService(prisma).lockAgenda(prisma, keys);
    expect(prisma.$executeRaw.mock.calls.map((c: any[]) => c[1])).toEqual(
      [keys[1], keys[0]].map(agendaLockKey),
    );
  });

  it('toBookingConflict traduce lock_timeout, deadlock y duplicado de turno a 409', () => {
    const known = (
      code: string,
      meta: Record<string, unknown>,
      message = 'x',
    ) =>
      new Prisma.PrismaClientKnownRequestError(message, {
        code,
        clientVersion: 'test',
        meta,
      });
    expect(toBookingConflict(known('P2010', { code: '55P03' }))).toBeInstanceOf(
      ConflictException,
    );
    expect(toBookingConflict(known('P2034', {}))).toBeInstanceOf(
      ConflictException,
    );
    expect(
      toBookingConflict(
        known('P2002', { target: ['itemId', 'date', 'startMinute'] }),
      ),
    ).toBeInstanceOf(ConflictException);
    const other = known('P2002', { target: ['idempotencyKey'] });
    expect(toBookingConflict(other)).toBe(other);
    const plain = new Error('boom');
    expect(toBookingConflict(plain)).toBe(plain);
  });
});
