import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Weekday } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ItemsService } from '../src/items/items.service';
import { PublicService } from '../src/public/public.service';
import { SalesService } from '../src/sales/sales.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { lockItemConfiguration } from '../src/items/item-service-policy';
import {
  createBusinessFixture,
  deleteBusinessFixtures,
  verifyIsolatedTestEnvironment,
} from './business-fixtures';

describe('F1.5 appointment policy (isolated PostgreSQL)', () => {
  let app: INestApplication, prisma: PrismaService, items: ItemsService;
  let store: PublicService,
    sales: SalesService,
    reservations: ReservationsService;
  let businessId: string;
  const slug = 'f15-' + randomUUID();
  const schedule = Object.values(Weekday).map((weekday) => ({
    weekday,
    startMinute: 480,
    endMinute: 1200,
  }));
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const service = (requiresAppointment = false) =>
    items.create(businessId, {
      name: 'Servicio F15',
      type: 'SERVICE',
      price: 12345,
      durationMinutes: 95,
      requiresAppointment,
      allowWalkIn: false,
      schedule,
    });
  const booking = (itemId: string) => ({
    itemId,
    date,
    startMinute: 600,
    endMinute: 695,
  });
  beforeAll(async () => {
    await verifyIsolatedTestEnvironment();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    items = app.get(ItemsService);
    store = app.get(PublicService);
    sales = app.get(SalesService);
    reservations = app.get(ReservationsService);
    businessId = (
      await createBusinessFixture(prisma, {
        data: {
          name: 'F15',
          slug,
          fiscalId: slug,
          phoneWhatsapp: '573001112233',
        },
      })
    ).id;
  }, 30000);
  afterAll(async () => {
    if (businessId) await deleteBusinessFixtures(prisma, [businessId]);
    await app?.close();
  });

  it('distinguishes legacy defaults, explicit new form defaults and products', async () => {
    const legacy = await items.create(businessId, {
      name: 'Legacy',
      type: 'SERVICE',
      price: 100,
      durationMinutes: 95,
      schedule,
    });
    expect(legacy).toMatchObject({
      requiresAppointment: true,
      allowWalkIn: true,
    });
    expect(await service(true)).toMatchObject({
      requiresAppointment: true,
      allowWalkIn: false,
    });
    const product = await items.create(businessId, {
      name: 'Product',
      type: 'PRODUCT',
      price: 100,
    });
    expect(product).toMatchObject({
      requiresAppointment: false,
      allowWalkIn: false,
    });
    expect(
      await items.update(businessId, legacy.id, { name: 'Legacy edited' }),
    ).toMatchObject({ requiresAppointment: true, allowWalkIn: true });
  });

  it('backfills legacy rows with the actual additive migration and retains database defaults', async () => {
    await prisma.$transaction(async (tx) => {
      // A transaction-local temporary table shadows Item only on this test connection.
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "Item" (id text, type text, price integer) ON COMMIT DROP',
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Item" VALUES ('service','SERVICE',123), ('product','PRODUCT',456)`,
      );
      const migration = readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261123120000_service_appointment_policy/migration.sql',
        ),
        'utf8',
      );
      for (const statement of migration.split(';').filter((sql) => sql.trim()))
        await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          price: number;
          requiresAppointment: boolean;
          allowWalkIn: boolean;
        }>
      >`SELECT * FROM "Item" ORDER BY id`;
      expect(rows).toEqual([
        {
          id: 'product',
          type: 'PRODUCT',
          price: 456,
          requiresAppointment: false,
          allowWalkIn: false,
        },
        {
          id: 'service',
          type: 'SERVICE',
          price: 123,
          requiresAppointment: true,
          allowWalkIn: true,
        },
      ]);
      await tx.$executeRawUnsafe(
        `INSERT INTO "Item" (id,type,price) VALUES ('legacy-new','SERVICE',789)`,
      );
      expect(
        await tx.$queryRaw`SELECT "requiresAppointment", "allowWalkIn" FROM "Item" WHERE id='legacy-new'`,
      ).toEqual([{ requiresAppointment: true, allowWalkIn: true }]);
    });
  });

  it('creates without schedule, preserves null duration, and validates reactivation', async () => {
    const item = await items.create(businessId, {
      name: 'No calendar',
      type: 'SERVICE',
      price: 456,
      requiresAppointment: false,
    });
    expect(item.durationMinutes).toBeNull();
    expect(
      await items.update(businessId, item.id, {
        type: 'SERVICE',
        name: 'Edited',
      }),
    ).toMatchObject({ durationMinutes: null, requiresAppointment: false });
    await expect(
      items.update(businessId, item.id, { requiresAppointment: true }),
    ).rejects.toThrow();
    await items.update(businessId, item.id, {
      requiresAppointment: true,
      durationMinutes: 95,
      schedule,
    });
    expect(
      (await reservations.getAvailability(businessId, item.id, date)).length,
    ).toBeGreaterThan(0);
  });

  it('has no availability and rejects direct and scheduled sales bookings', async () => {
    const item = await service();
    expect(
      await reservations.getAvailability(businessId, item.id, date),
    ).toEqual([]);
    await expect(
      reservations.create(businessId, booking(item.id)),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_WITHOUT_APPOINTMENT' },
    });
    await expect(
      store.createReservation(slug, {
        ...booking(item.id),
        customerName: 'Cliente',
        customerWhatsapp: '573001112233',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_WITHOUT_APPOINTMENT' },
    });
    await expect(
      sales.create(businessId, {
        origin: 'MANUAL',
        type: 'SERVICIO',
        status: 'PENDIENTE',
        scheduledAt: date + 'T10:00:00-05:00',
        items: [{ itemId: item.id, quantity: 1 }],
      }),
    ).rejects.toThrow();
    expect(await prisma.reservation.count({ where: { itemId: item.id } })).toBe(
      0,
    );
  });

  it('creates mixed public and internal orders without reservations and preserves snapshots/idempotency', async () => {
    const item = await service();
    const product = await items.create(businessId, {
      name: 'Product',
      type: 'PRODUCT',
      price: 100,
    });
    const lines = [
      { itemId: product.id, quantity: 2 },
      { itemId: item.id, quantity: 1 },
    ];
    const dto = {
      idempotencyKey: randomUUID(),
      customerName: 'Cliente',
      customerWhatsapp: '573001112233',
      items: lines,
    };
    const first = await store.createOrder(slug, dto);
    expect(await store.createOrder(slug, dto)).toEqual(first);
    await sales.create(businessId, {
      origin: 'MANUAL',
      type: 'SERVICIO',
      status: 'PENDIENTE',
      items: lines,
    });
    const orders = await prisma.order.findMany({
      where: { businessId, items: { some: { itemId: item.id } } },
      include: { items: true },
    });
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(Number(order.total)).toBe(12545);
      expect(order.items.find((line) => line.itemId === item.id)).toMatchObject(
        { itemTypeSnapshot: 'SERVICE', durationMinutesSnapshot: 95 },
      );
      expect(
        await prisma.reservation.findUnique({ where: { id: order.id } }),
      ).toBeNull();
    }
  });

  it('keeps hidden-price protection and rejects appointment items in commercial carts', async () => {
    const item = await service();
    const dto = {
      idempotencyKey: randomUUID(),
      customerName: 'Cliente',
      customerWhatsapp: '573001112233',
      items: [{ itemId: item.id, quantity: 1 }],
    };
    await items.update(businessId, item.id, { publishWithoutPrice: true });
    await expect(store.createOrder(slug, dto)).rejects.toMatchObject({
      response: { code: 'PRICE_ON_REQUEST' },
    });
    await items.update(businessId, item.id, {
      publishWithoutPrice: false,
      requiresAppointment: true,
    });
    await expect(store.createOrder(slug, dto)).rejects.toMatchObject({
      response: { code: 'APPOINTMENT_REQUIRES_SEPARATE_BOOKING' },
    });
  });

  it('rejects switching off with future open reservations and retains all values after cancellation', async () => {
    const item = await service(true);
    const reservation = await reservations.create(businessId, booking(item.id));
    await expect(
      items.update(businessId, item.id, { requiresAppointment: false }),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_HAS_OPEN_APPOINTMENTS' },
    });
    await reservations.cancel(businessId, reservation.id, 'Cliente cancela');
    const saved = await items.update(businessId, item.id, {
      requiresAppointment: false,
    });
    expect(saved.durationMinutes).toBe(95);
    expect(Number(saved.price)).toBe(12345);
    expect(saved.schedule).toHaveLength(7);
    await items.update(businessId, item.id, { requiresAppointment: true });
    expect(
      (await reservations.getAvailability(businessId, item.id, date)).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('CANCELLED');
  });

  it('preserves past pending reservations and cancellation, forbids rescheduling', async () => {
    const item = await service(true);
    const reservation = await prisma.reservation.create({
      data: {
        businessId,
        itemId: item.id,
        date: new Date(past),
        startMinute: 600,
        endMinute: 695,
        status: 'PENDING',
      },
    });
    await items.update(businessId, item.id, { requiresAppointment: false });
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe('PENDING');
    await expect(
      reservations.reschedule(businessId, reservation.id, booking(item.id)),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_WITHOUT_APPOINTMENT' },
    });
    expect((await reservations.cancel(businessId, reservation.id)).status).toBe(
      'CANCELLED',
    );
  });

  it('rejects a transition during an ongoing appointment', async () => {
    const item = await service(true);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const minute = Number(part('hour')) * 60 + Number(part('minute'));
    await prisma.reservation.create({
      data: {
        businessId,
        itemId: item.id,
        date: new Date(`${part('year')}-${part('month')}-${part('day')}`),
        startMinute: Math.max(0, minute - 5),
        endMinute: Math.min(1440, minute + 5),
        status: 'CONFIRMED',
      },
    });
    await expect(
      items.update(businessId, item.id, { requiresAppointment: false }),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_HAS_OPEN_APPOINTMENTS' },
    });
  });

  it('isolates business updates', async () => {
    const item = await service();
    await expect(
      items.update(randomUUID(), item.id, { requiresAppointment: true }),
    ).rejects.toThrow('Item not found');
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: item.id } }))
        .requiresAppointment,
    ).toBe(false);
  });

  it('completes a past v2 free appointment after switching off without changing its history', async () => {
    const item = await service(true);
    const reservation = await prisma.reservation.create({
      data: {
        businessId,
        itemId: item.id,
        date: new Date(past),
        startMinute: 600,
        endMinute: 695,
        status: 'CONFIRMED',
        commercialPolicyVersion: 2,
        priceSnapshot: 0,
      },
    });
    await items.update(businessId, item.id, { requiresAppointment: false });
    await sales.completeReservation(businessId, reservation.id, true);
    expect(
      await prisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      }),
    ).toMatchObject({
      status: 'COMPLETED',
      itemId: item.id,
      startMinute: 600,
      endMinute: 695,
    });
  });

  it('reactivating agenda never converts an existing commercial order into a reservation', async () => {
    const item = await service();
    const order = await sales.create(businessId, {
      origin: 'MANUAL',
      type: 'SERVICIO',
      status: 'PENDIENTE',
      items: [{ itemId: item.id, quantity: 1 }],
    });
    await items.update(businessId, item.id, { requiresAppointment: true });
    await expect(
      sales.update(businessId, order.id, {
        scheduledAt: date + 'T10:00:00-05:00',
      }),
    ).rejects.toThrow('Una orden sin reserva');
    expect(
      await prisma.reservation.findUnique({ where: { id: order.id } }),
    ).toBeNull();
  });

  it('serializes simultaneous booking and switching off: never commits both', async () => {
    const item = await service(true);
    const results = await Promise.allSettled([
      reservations.create(businessId, booking(item.id)),
      items.update(businessId, item.id, { requiresAppointment: false }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(await prisma.reservation.count({ where: { itemId: item.id } })).toBe(
      saved.requiresAppointment ? 1 : 0,
    );
  });

  it('commercial transaction waits for modality update and revalidates inside its transaction', async () => {
    const item = await service();
    let locked!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const update = prisma.$transaction(async (tx) => {
      await lockItemConfiguration(tx, businessId, [item.id], true);
      await tx.item.update({
        where: { id: item.id },
        data: { requiresAppointment: true },
      });
      locked();
      await gate;
    });
    await ready;
    const creation = sales.create(businessId, {
      origin: 'MANUAL',
      type: 'SERVICIO',
      status: 'PENDIENTE',
      items: [{ itemId: item.id, quantity: 1 }],
    });
    const observed = creation.then(
      () => null,
      (error) => error,
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      release();
    }
    await update;
    expect(await observed).toMatchObject({
      response: { code: 'APPOINTMENT_REQUIRES_SEPARATE_BOOKING' },
    });
    expect(
      await prisma.order.count({
        where: { businessId, items: { some: { itemId: item.id } } },
      }),
    ).toBe(0);
  });
});
