import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  AvailabilityService,
  computeSlots,
  legacySlotInterval,
  resolveSlotInterval,
} from './availability.service';
import {
  BUSINESS_ID,
  createFakePrisma,
  createRoutes,
  day,
  Fixture,
  freezeBogotaTime,
  ITEM_ID,
  OTHER_ITEM_ID,
} from './availability.test-utils';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const weekdayOf = (key: string) => WEEKDAYS[day(key).getUTCDay()];

// "Now" is frozen at Tuesday 2026-11-10 10:20 (Bogotá).
const TODAY = '2026-11-10';
const FUTURE = '2026-11-16';
const PAST = '2026-11-02';
const win = (
  startMinute: number,
  endMinute: number,
  itemId: string | null = ITEM_ID,
  date = FUTURE,
) => ({ itemId, weekday: weekdayOf(date), startMinute, endMinute });

describe('computeSlots (pure)', () => {
  const H = (h: number, m = 0) => h * 60 + m;

  it('continuous window, 60 min', () => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(13) }],
        blocks: [],
        reservations: [],
        durationMinutes: 60,
      }),
    ).toEqual(['09:00', '10:00', '11:00', '12:00']);
  });

  it('split windows never offer a slot crossing the gap', () => {
    expect(
      computeSlots({
        windows: [
          { startMinute: H(14), endMinute: H(16) },
          { startMinute: H(9), endMinute: H(10, 30) },
        ],
        blocks: [],
        reservations: [],
        durationMinutes: 60,
      }),
    ).toEqual(['09:00', '14:00', '15:00']);
  });

  it.each([
    [15, ['09:00', '09:15', '09:30', '09:45']],
    [30, ['09:00', '09:30']],
    [45, ['09:00']],
    [60, ['09:00']],
    [90, []],
  ])('duration %i min inside 09:00-10:00', (duration, expected) => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(10) }],
        blocks: [],
        reservations: [],
        durationMinutes: duration,
      }),
    ).toEqual(expected);
  });

  it.each([15, 30, 45, 60, 90])(
    'duration %i min: every slot fits entirely in the window',
    (duration) => {
      const window = { startMinute: H(8, 30), endMinute: H(12, 10) };
      const slots = computeSlots({
        windows: [window],
        blocks: [],
        reservations: [],
        durationMinutes: duration,
      });
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const [h, m] = slot.split(':').map(Number);
        const start = h * 60 + m;
        expect(start).toBeGreaterThanOrEqual(window.startMinute);
        expect(start + duration).toBeLessThanOrEqual(window.endMinute);
        expect(start % legacySlotInterval(duration)).toBe(0);
      }
    },
  );

  it('step is the largest clean subdivision of the hour within the duration', () => {
    expect([15, 30, 45, 60, 90, 120, 20, 7].map(legacySlotInterval)).toEqual([
      15, 30, 30, 60, 60, 60, 15, 5,
    ]);
  });

  it('reservations block any overlapping slot but not adjacent ones', () => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(13) }],
        blocks: [],
        reservations: [{ startMinute: H(10, 30), endMinute: H(11) }],
        durationMinutes: 30,
      }),
    ).toEqual(['09:00', '09:30', '10:00', '11:00', '11:30', '12:00', '12:30']);
  });

  it('partial, full-day and open-ended blocks', () => {
    const base = {
      windows: [{ startMinute: H(9), endMinute: H(13) }],
      reservations: [],
      durationMinutes: 60,
    };
    expect(
      computeSlots({
        ...base,
        blocks: [{ startMinute: H(10), endMinute: H(11) }],
      }),
    ).toEqual(['09:00', '11:00', '12:00']);
    expect(
      computeSlots({
        ...base,
        blocks: [{ startMinute: null, endMinute: null }],
      }),
    ).toEqual([]);
    expect(
      computeSlots({
        ...base,
        blocks: [{ startMinute: H(11), endMinute: null }],
      }),
    ).toEqual(['09:00', '10:00']);
    expect(
      computeSlots({
        ...base,
        blocks: [{ startMinute: null, endMinute: H(11) }],
      }),
    ).toEqual(['11:00', '12:00']);
  });

  it('no windows means no availability', () => {
    expect(
      computeSlots({
        windows: [],
        blocks: [],
        reservations: [],
        durationMinutes: 60,
      }),
    ).toEqual([]);
  });

  it('skips starts before notBeforeMinute (current time today)', () => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(13) }],
        blocks: [],
        reservations: [],
        durationMinutes: 60,
        notBeforeMinute: H(10, 20),
      }),
    ).toEqual(['11:00', '12:00']);
  });

  it('missing, zero, negative or fractional duration offers no slots (never loops)', () => {
    for (const durationMinutes of [null, undefined, 0, -5, 2.5]) {
      expect(
        computeSlots({
          windows: [{ startMinute: H(9), endMinute: H(11) }],
          blocks: [],
          reservations: [],
          durationMinutes,
        }),
      ).toEqual([]);
    }
  });
});

describe('AvailabilityService', () => {
  beforeEach(() => freezeBogotaTime(`${TODAY}T10:20:00`));
  afterEach(() => jest.useRealTimers());

  const service = (fixture: Fixture) =>
    new AvailabilityService(createFakePrisma(fixture));
  const query = {
    businessId: BUSINESS_ID,
    itemId: ITEM_ID,
    durationMinutes: 60,
  };

  describe('manual historical suggestions', () => {
    const historical = (times: string[]) => times.map(time => ({ time, kind: 'HISTORICAL' }));
    it.each([
      ['specific window', [win(480, 660)], ['08:00', '09:00', '10:00']],
      ['split windows', [win(480, 600), win(840, 960)], ['08:00', '09:00', '14:00', '15:00']],
      ['general fallback', [win(480, 660, null)], ['08:00', '09:00', '10:00']],
      ['specific overrides general', [win(480, 600), win(840, 960, null)], ['08:00', '09:00']],
      ['closed weekday', [win(480, 660, ITEM_ID, TODAY), win(840, 960, null)], []],
      ['no configured windows', [], []],
    ])('%s uses the same grid as future bookings', async (_name, windows, times) => {
      const svc = service({ durationMinutes: 60, windows: windows as Fixture['windows'] });
      expect(await svc.getManualSalesSlots({ ...query, date: day(PAST) })).toEqual(historical(times as string[]));
      expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual(times);
      expect(await svc.getSlots({ ...query, date: day(PAST) })).toEqual([]);
    });

    it('respects explicit interval and actual duration at the window boundary', async () => {
      const svc = service({ durationMinutes: 60, windows: [win(480, 660)] });
      expect(await svc.getManualSalesSlots({ ...query, date: day(PAST), slotIntervalMinutes: 30 }, 90))
        .toEqual(historical(['08:00', '08:30', '09:00', '09:30']));
    });

    it('uses different windows on different weekdays', async () => {
      const svc = service({ durationMinutes: 60, windows: [win(480, 600), win(840, 960, ITEM_ID, '2026-11-03')] });
      expect(await svc.getManualSalesSlots({ ...query, date: day('2026-11-03') })).toEqual(historical(['14:00', '15:00']));
    });

    it('keeps blocks and overlaps when suggesting history', async () => {
      const svc = service({ durationMinutes: 60, windows: [win(480, 660)],
        blocks: [{date: PAST, startMinute: 480, endMinute: 540}],
        reservations: [{date: PAST, startMinute: 540, endMinute: 600}] });
      expect(await svc.getManualSalesSlots({ ...query, date: day(PAST) })).toEqual(historical(['10:00']));
    });

    it('today combines past suggestions and unchanged future availability without duplicates', async () => {
      const svc = service({ durationMinutes: 60, windows: [win(480, 720, ITEM_ID, TODAY)] });
      expect(await svc.getManualSalesSlots({ ...query, date: day(TODAY) })).toEqual([
        ...historical(['08:00', '09:00', '10:00']), {time: '11:00', kind: 'AVAILABLE'},
      ]);
    });
  });

  it('service-specific windows replace the general business schedule', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 660), win(840, 1080, null)],
    });
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([
      '09:00',
      '10:00',
    ]);
  });

  it('a service with specific windows on other weekdays is closed on this one', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 660, ITEM_ID, '2026-11-17'), win(840, 1080, null)],
    });
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([]);
  });

  it('falls back to the general schedule when the service has none', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(840, 960, null)],
    });
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([
      '14:00',
      '15:00',
    ]);
  });

  it('only non-cancelled reservations of the same service block', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 780)],
      reservations: [
        { date: FUTURE, startMinute: 540, endMinute: 600, status: 'CANCELLED' },
        { date: FUTURE, startMinute: 600, endMinute: 660, status: 'PENDING' },
        {
          date: FUTURE,
          startMinute: 660,
          endMinute: 720,
          itemId: OTHER_ITEM_ID,
        },
      ],
    });
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([
      '09:00',
      '11:00',
      '12:00',
    ]);
  });

  it('excludeReservationId frees the slot of the reservation being edited', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 660)],
      reservations: [
        { id: 'r-edit', date: FUTURE, startMinute: 540, endMinute: 600 },
      ],
    });
    expect(
      await svc.getSlots({
        ...query,
        date: day(FUTURE),
        excludeReservationId: 'r-edit',
      }),
    ).toEqual(['09:00', '10:00']);
  });

  it('blocks of another service do not apply', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 660)],
      blocks: [
        {
          itemId: OTHER_ITEM_ID,
          date: FUTURE,
          startMinute: null,
          endMinute: null,
        },
      ],
    });
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([
      '09:00',
      '10:00',
    ]);
  });

  it('today hides elapsed starts; past dates offer nothing', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 780, ITEM_ID, TODAY), win(540, 780, ITEM_ID, PAST)],
    });
    expect(await svc.getSlots({ ...query, date: day(TODAY) })).toEqual([
      '11:00',
      '12:00',
    ]);
    expect(await svc.getSlots({ ...query, date: day(PAST) })).toEqual([]);
  });

  it('allowPastDateKey keeps the full day for that date only', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 660, ITEM_ID, PAST), win(540, 660, ITEM_ID, TODAY)],
    });
    expect(
      await svc.getSlots({ ...query, date: day(PAST), allowPastDateKey: PAST }),
    ).toEqual(['09:00', '10:00']);
    expect(
      await svc.getSlots({
        ...query,
        date: day(TODAY),
        allowPastDateKey: TODAY,
      }),
    ).toEqual(['09:00', '10:00']);
    expect(
      await svc.getSlots({
        ...query,
        date: day(TODAY),
        allowPastDateKey: PAST,
      }),
    ).toEqual([]);
  });

  it('calendar lists only future days with at least one slot', async () => {
    const svc = service({
      durationMinutes: 60,
      windows: [win(540, 600)], // Mondays 09:00-10:00
      reservations: [{ date: '2026-11-23', startMinute: 540, endMinute: 600 }],
    });
    expect(
      await svc.getAvailableDates({ ...query, year: 2026, monthIndex: 10 }),
    ).toEqual(['2026-11-16', '2026-11-30']);
  });
});

describe('Reservas, Ventas y tienda pública devuelven lo mismo', () => {
  beforeEach(() => freezeBogotaTime(`${TODAY}T10:20:00`));
  afterEach(() => jest.useRealTimers());

  const scenarios: Array<[string, Fixture, string, string[]]> = [
    [
      'continuo',
      { durationMinutes: 60, windows: [win(540, 780)] },
      FUTURE,
      ['09:00', '10:00', '11:00', '12:00'],
    ],
    [
      'dividido',
      { durationMinutes: 60, windows: [win(540, 720), win(840, 960)] },
      FUTURE,
      ['09:00', '10:00', '11:00', '14:00', '15:00'],
    ],
    [
      '15 min',
      { durationMinutes: 15, windows: [win(540, 600)] },
      FUTURE,
      ['09:00', '09:15', '09:30', '09:45'],
    ],
    [
      '30 min',
      { durationMinutes: 30, windows: [win(540, 600)] },
      FUTURE,
      ['09:00', '09:30'],
    ],
    [
      '45 min',
      { durationMinutes: 45, windows: [win(540, 660)] },
      FUTURE,
      ['09:00', '09:30', '10:00'],
    ],
    [
      '60 min',
      { durationMinutes: 60, windows: [win(540, 660)] },
      FUTURE,
      ['09:00', '10:00'],
    ],
    [
      '90 min',
      { durationMinutes: 90, windows: [win(540, 780)] },
      FUTURE,
      ['09:00', '10:00', '11:00'],
    ],
    [
      'ventana 08:30',
      { durationMinutes: 60, windows: [win(510, 720)] },
      FUTURE,
      ['09:00', '10:00', '11:00'],
    ],
    [
      'ventanas contiguas',
      { durationMinutes: 90, windows: [win(540, 600), win(600, 720)] },
      FUTURE,
      ['09:00', '10:00'],
    ],
    [
      'reservas solapadas',
      {
        durationMinutes: 60,
        windows: [win(540, 840)],
        reservations: [
          { date: FUTURE, startMinute: 600, endMinute: 660 },
          { date: FUTURE, startMinute: 690, endMinute: 750, status: 'PENDING' },
          {
            date: FUTURE,
            startMinute: 540,
            endMinute: 600,
            status: 'CANCELLED',
          },
        ],
      },
      FUTURE,
      ['09:00', '13:00'],
    ],
    [
      'bloqueo parcial',
      {
        durationMinutes: 60,
        windows: [win(780, 1020)],
        blocks: [{ date: FUTURE, startMinute: 840, endMinute: 900 }],
      },
      FUTURE,
      ['13:00', '15:00', '16:00'],
    ],
    [
      'bloqueo completo',
      {
        durationMinutes: 60,
        windows: [win(540, 780)],
        blocks: [{ date: FUTURE, startMinute: null, endMinute: null }],
      },
      FUTURE,
      [],
    ],
    [
      'sin ventanas ese día',
      { durationMinutes: 60, windows: [win(540, 780, ITEM_ID, '2026-11-17')] },
      FUTURE,
      [],
    ],
    [
      'hoy, horas pasadas',
      { durationMinutes: 60, windows: [win(540, 780, ITEM_ID, TODAY)] },
      TODAY,
      ['11:00', '12:00'],
    ],
    [
      'fecha pasada',
      { durationMinutes: 60, windows: [win(540, 780, ITEM_ID, PAST)] },
      PAST,
      [],
    ],
    [
      'específico sobre general',
      { durationMinutes: 60, windows: [win(540, 660), win(840, 960, null)] },
      FUTURE,
      ['09:00', '10:00'],
    ],
  ];

  it.each(scenarios)('%s', async (_name, fixture, date, expected) => {
    const routes = createRoutes(createFakePrisma(fixture));
    expect(await routes.reservations.slots(date)).toEqual(expected);
    expect(await routes.publicStore.slots(date)).toEqual(expected);
    expect(await routes.sales.slots(date)).toEqual(expected);
  });

  it('calendario mensual equivalente', async () => {
    const routes = createRoutes(
      createFakePrisma({
        durationMinutes: 60,
        windows: [win(540, 600)],
        reservations: [
          { date: '2026-11-23', startMinute: 540, endMinute: 600 },
        ],
      }),
    );
    const expected = ['2026-11-16', '2026-11-30'];
    expect(await routes.reservations.calendar('2026-11')).toEqual(expected);
    expect(await routes.publicStore.calendar('2026-11')).toEqual(expected);
    expect(await routes.sales.calendar('2026-11')).toEqual(expected);
  });

  it('Ventas conserva la fecha propia de una reserva pasada al editarla', async () => {
    const routes = createRoutes(
      createFakePrisma({
        durationMinutes: 60,
        anchorDate: PAST,
        windows: [win(540, 660, ITEM_ID, PAST)],
      }),
    );
    expect(await routes.sales.slots(PAST)).toEqual(['09:00', '10:00']);
    expect(await routes.sales.calendar('2026-11')).toContain(PAST);
    expect(await routes.reservations.slots(PAST)).toEqual([]);
  });
});

describe('Política de intervalo entre inicios', () => {
  const H = (h: number, m = 0) => h * 60 + m;
  beforeEach(() => freezeBogotaTime(`${TODAY}T10:20:00`));
  afterEach(() => jest.useRealTimers());

  it('sin intervalo configurado se aplica la política actual (compatibilidad)', () => {
    // Durations the current form can produce (whole hours) all keep 60-min spacing.
    for (const duration of [60, 120, 180, 240]) {
      expect(resolveSlotInterval(duration, null)).toBe(60);
      expect(resolveSlotInterval(duration, undefined)).toBe(60);
    }
  });

  it.each([0, -15, 7, 45, 90, Number.NaN, 2.5])(
    'intervalo inválido %p cae a la política actual',
    (interval) => {
      expect(resolveSlotInterval(30, interval)).toBe(30);
      expect(resolveSlotInterval(60, interval)).toBe(60);
    },
  );

  it('intervalo de 15 con duración 60: inicios cada 15, turno de 60', () => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(11) }],
        blocks: [],
        reservations: [],
        durationMinutes: 60,
        slotIntervalMinutes: 15,
      }),
    ).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00']);
  });

  it('el solapamiento usa la duración real, no el intervalo', () => {
    expect(
      computeSlots({
        windows: [{ startMinute: H(9), endMinute: H(12) }],
        blocks: [],
        reservations: [{ startMinute: H(10), endMinute: H(11) }],
        durationMinutes: 60,
        slotIntervalMinutes: 15,
      }),
    ).toEqual(['09:00', '11:00']);
  });

  it.each([
    [15, 90],
    [30, 45],
    [60, 15],
    [20, 60],
  ])(
    'intervalo %i / duración %i: ningún turno excede la franja y todos caen en la grilla',
    (interval, duration) => {
      const window = { startMinute: H(8, 30), endMinute: H(12, 10) };
      const slots = computeSlots({
        windows: [window],
        blocks: [],
        reservations: [],
        durationMinutes: duration,
        slotIntervalMinutes: interval,
      });
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const [h, m] = slot.split(':').map(Number);
        const start = h * 60 + m;
        expect(start % interval).toBe(0);
        expect(start).toBeGreaterThanOrEqual(window.startMinute);
        expect(start + duration).toBeLessThanOrEqual(window.endMinute);
      }
    },
  );

  it('el servicio propaga el intervalo al día y al calendario', async () => {
    const svc = new AvailabilityService(
      createFakePrisma({
        durationMinutes: 60,
        windows: [win(H(9, 15), H(10, 30))],
      }),
    );
    const query = {
      businessId: BUSINESS_ID,
      itemId: ITEM_ID,
      durationMinutes: 60,
      slotIntervalMinutes: 15,
    };
    expect(await svc.getSlots({ ...query, date: day(FUTURE) })).toEqual([
      '09:15',
      '09:30',
    ]);
    // 09:15-10:30 fits no 60-min slot on the hourly grid, but does on the 15-min grid.
    const month = { year: 2026, monthIndex: 10 };
    expect(await svc.getAvailableDates({ ...query, ...month })).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(
      await svc.getAvailableDates({
        ...query,
        ...month,
        slotIntervalMinutes: null,
      }),
    ).toEqual([]);
  });

  it('las tres rutas resuelven el intervalo en el motor con los mismos parámetros', async () => {
    const spy = jest.spyOn(AvailabilityService.prototype, 'getSlots');
    const routes = createRoutes(
      createFakePrisma({ durationMinutes: 120, windows: [win(H(8), H(14))] }),
    );
    const results = [
      await routes.reservations.slots(FUTURE),
      await routes.publicStore.slots(FUTURE),
      await routes.sales.slots(FUTURE),
    ];
    expect(results).toEqual(
      Array(3).fill(['08:00', '09:00', '10:00', '11:00', '12:00']),
    );
    const calls = spy.mock.calls.map(([q]) => ({
      duration: q.durationMinutes,
      interval: q.slotIntervalMinutes,
    }));
    expect(calls).toEqual(
      Array(3).fill({ duration: 120, interval: undefined }),
    );
    spy.mockRestore();
  });

  it('sin duración válida ninguna ruta ofrece horarios (tampoco Ventas al editar)', async () => {
    const routes = createRoutes(
      createFakePrisma({
        durationMinutes: null,
        anchorMinutes: [0, 90],
        windows: [win(H(9), H(12))],
      }),
    );
    // reserveSlot rejects these services, so no route may offer slots for them.
    expect(await routes.reservations.slots(FUTURE)).toEqual([]);
    expect(await routes.publicStore.slots(FUTURE)).toEqual([]);
    expect(await routes.sales.slots(FUTURE)).toEqual([]);
  });
});
