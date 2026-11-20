import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Weekday } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PublicService } from '../src/public/public.service';
import {
  createBusinessFixture,
  deleteBusinessFixtures,
  verifyIsolatedTestEnvironment,
} from './business-fixtures';

describe('F1.2-A public prices (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: PublicService;
  let businessId: string;
  let productId: string;
  let serviceId: string;
  const slug = 'f12-' + randomUUID();
  beforeAll(async () => {
    await verifyIsolatedTestEnvironment();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    store = app.get(PublicService);
    const business = await createBusinessFixture(prisma, {
      data: {
        name: 'F12 test',
        slug,
        fiscalId: slug,
        phoneWhatsapp: '573001112233',
      },
    });
    businessId = business.id;
    productId = (
      await prisma.item.create({
        data: {
          businessId,
          type: 'PRODUCT',
          name: 'Hidden product',
          price: 950000,
          publishWithoutPrice: true,
          inventoryMode: 'NONE',
        },
      })
    ).id;
    serviceId = (
      await prisma.item.create({
        data: {
          businessId,
          type: 'SERVICE',
          name: 'Hidden service',
          price: 45000,
          publishWithoutPrice: true,
          durationMinutes: 45,
          inventoryMode: 'NONE',
        },
      })
    ).id;
    await prisma.serviceScheduleWindow.createMany({
      data: Object.values(Weekday).map((weekday) => ({
        businessId,
        itemId: serviceId,
        weekday,
        startMinute: 540,
        endMinute: 1020,
      })),
    });
  }, 30000);
  afterAll(async () => {
    if (businessId) await deleteBusinessFixtures(prisma, [businessId]);
    await app?.close();
  });
  it('masks catalog JSON, disables caching and preserves internal price', async () => {
    const result = await request(
      app.getHttpServer() as import('node:http').Server,
    )
      .get('/public/' + slug + '/items')
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    const catalog = result.body as {
      business: { phoneWhatsapp: string };
      data: Array<{ id: string; price: number | null }>;
    };
    expect(catalog.business.phoneWhatsapp).toBe('573001112233');
    expect(catalog.data.find((i) => i.id === productId)?.price).toBeNull();
    expect(JSON.stringify(result.body)).not.toContain('950000');
    expect(
      Number(
        (await prisma.item.findUniqueOrThrow({ where: { id: productId } }))
          .price,
      ),
    ).toBe(950000);
  });
  it('rejects hidden orders without commercial writes', async () => {
    await expect(
      store.createOrder(slug, {
        idempotencyKey: randomUUID(),
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [{ itemId: productId, quantity: 2 }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRICE_ON_REQUEST' },
    });
    expect(await prisma.order.count({ where: { businessId } })).toBe(0);
    expect(
      await prisma.accountingMovement.count({ where: { businessId } }),
    ).toBe(0);
  });
  it('preserves normal public order creation and idempotency', async () => {
    await prisma.item.update({
      where: { id: productId },
      data: { publishWithoutPrice: false },
    });
    try {
      const dto = {
        idempotencyKey: randomUUID(),
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [{ itemId: productId, quantity: 2 }],
      };
      const order = await store.createOrder(slug, dto);
      expect(await store.createOrder(slug, dto)).toEqual(order);
      const rows = await prisma.order.findMany({
        where: { businessId },
        include: { items: true },
      });
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].items[0].unitPrice)).toBe(950000);
      expect(Number(rows[0].total)).toBe(1900000);
    } finally {
      await prisma.item.update({
        where: { id: productId },
        data: { publishWithoutPrice: true },
      });
    }
  });
  it('FOR SHARE prevents an overlapping committed visibility update', async () => {
    await prisma.item.update({
      where: { id: productId },
      data: { publishWithoutPrice: false },
    });
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const reader = prisma.$transaction(async (tx) => {
      await (
        store as unknown as {
          assertPublicPricedItems(
            t: typeof tx,
            b: string,
            ids: string[],
          ): Promise<void>;
        }
      ).assertPublicPricedItems(tx, businessId, [productId]);
      locked();
      await gate;
    });
    const writer = new PrismaClient();
    try {
      await ready;
      await expect(
        writer.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
          await tx.item.update({
            where: { id: productId },
            data: { publishWithoutPrice: true },
          });
        }),
      ).rejects.toThrow();
    } finally {
      release();
      await reader;
      await writer.$disconnect();
      await prisma.item.update({
        where: { id: productId },
        data: { publishWithoutPrice: true },
      });
    }
  });
  it('books hidden services with v2 snapshot, duration and idempotency intact', async () => {
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dto = {
      itemId: serviceId,
      customerName: 'Customer',
      customerWhatsapp: '573001112233',
      date,
      startMinute: 600,
      endMinute: 645,
      idempotencyKey: randomUUID(),
    };
    const booking = await store.createReservation(slug, dto);
    expect(await store.createReservation(slug, dto)).toEqual(booking);
    const rows = await prisma.reservation.findMany({ where: { businessId } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].priceSnapshot)).toBe(45000);
    expect(rows[0].commercialPolicyVersion).toBe(2);
    expect(rows[0].endMinute - rows[0].startMinute).toBe(45);
    const result = await request(
      app.getHttpServer() as import('node:http').Server,
    )
      .get('/public/reservations/' + rows[0].id)
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(
      (result.body as { item: { price: number | null } }).item.price,
    ).toBeNull();
    expect(JSON.stringify(result.body)).not.toContain('45000');
    const lookup = await store.findReservationsByPhone(
      slug,
      dto.customerWhatsapp,
    );
    expect(lookup[0].item.price).toBeNull();
  });
});
