import {
  createBusinessFixture,
  deleteBusinessFixtures,
  verifyIsolatedTestEnvironment,
} from './business-fixtures';
import {
  ConflictException,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'node:crypto';
import { IngredientUnit, ItemType, UnitKind, Weekday } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PublicService } from '../src/public/public.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { ReservationsController } from '../src/reservations/reservations.controller';
import { SalesService } from '../src/sales/sales.service';

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const H = (h: number, m = 0) => h * 60 + m;

/** Bogotá calendar day `offset` days from today, as YYYY-MM-DD. */
function futureDay(offset: number) {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset),
  );
  return d.toISOString().slice(0, 10);
}
const asDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

function outcome(results: PromiseSettledResult<unknown>[]) {
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  return { fulfilled, rejected };
}

describe('Reservas: validación transaccional y concurrencia (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservations: ReservationsService;
  let publicStore: PublicService;
  let sales: SalesService;
  let businessId: string;
  let slug: string;
  let unitId: string;
  let service60: string;
  let service90: string;
  let ingredientId: string;
  let controller: ReservationsController;

  beforeAll(async () => {
    await verifyIsolatedTestEnvironment();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    reservations = app.get(ReservationsService);
    publicStore = app.get(PublicService);
    sales = app.get(SalesService);
    controller = app.get(ReservationsController);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    slug = `reservas-b1-${suffix}`;
    const business = await createBusinessFixture(prisma, {
      data: {
        name: 'Reservas concurrencia test',
        slug,
        fiscalId: `test-${suffix}`,
        phoneWhatsapp: '0000000000',
      },
    });
    businessId = business.id;

    const unit = await prisma.unit.create({
      data: {
        code: `TEST_RES_UNIT_${suffix}`,
        name: 'Unidad test',
        symbol: 'u',
        kind: UnitKind.COUNT,
        isSystem: false,
      },
    });
    unitId = unit.id;
    const ingredient = await prisma.ingredient.create({
      data: {
        businessId,
        name: 'Insumo de servicio',
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.UNIT,
        purchaseToConsumptionFactor: 1,
        stockUnitId: unitId,
        defaultPurchaseUnitId: unitId,
        currentStock: 100,
        averageCost: 2,
      },
    });
    ingredientId = ingredient.id;

    const createService = async (name: string, durationMinutes: number) => {
      const item = await prisma.item.create({
        data: {
          businessId,
          name,
          type: ItemType.SERVICE,
          price: 1000,
          durationMinutes,
        },
      });
      await prisma.serviceScheduleWindow.createMany({
        data: WEEKDAYS.map((weekday) => ({
          businessId,
          itemId: item.id,
          weekday,
          startMinute: H(8),
          endMinute: H(20),
        })),
      });
      return item.id;
    };
    service60 = await createService('Corte 60', 60);
    service90 = await createService('Tratamiento 90', 90);
    // Same legacy PUC fallback accounts sales-flow.e2e seeds; confirming posts accounting.
    const puc: Array<[string, string, string?]> = [
      ['1', 'Activo'],
      ['11', 'Disponible', '1'],
      ['13', 'Deudores', '1'],
      ['1355', 'Anticipos de impuestos', '13'],
      ['1105', 'Caja', '11'],
      ['110505', 'Caja General', '1105'],
      ['4', 'Ingresos'],
      ['41', 'Operacionales', '4'],
      ['4135', 'Comercio', '41'],
      ['413595', 'Venta de otros productos', '4135'],
      ['4170', 'Otras actividades de servicios', '41'],
      ['417095', 'Actividades conexas', '4170'],
      // Service ingredient consumption also posts inventory (1435) and cost of sales (6135).
      ['14', 'Inventarios', '1'],
      ['1435', 'Mercancías no fabricadas', '14'],
      ['6', 'Costos de ventas'],
      ['61', 'Costo de ventas', '6'],
      ['6135', 'Comercio', '61'],
    ];
    for (const [code, name, parent] of puc) {
      if (code.length === 1)
        await prisma.pucClase.upsert({
          where: { code },
          create: { code, name },
          update: {},
        });
      else if (code.length === 2)
        await prisma.pucGrupo.upsert({
          where: { code },
          create: { code, name, claseCode: parent! },
          update: {},
        });
      else if (code.length === 4)
        await prisma.pucCuenta.upsert({
          where: { code },
          create: { code, name, grupoCode: parent! },
          update: {},
        });
      else
        await prisma.pucSubcuenta.upsert({
          where: { code },
          create: { code, name, cuentaCode: parent!, active: true },
          update: {},
        });
    }
    await prisma.serviceIngredient.create({
      data: {
        businessId,
        serviceItemId: service60,
        ingredientId: ingredient.id,
        quantityRequired: 1,
      },
    });
  }, 60000);

  afterAll(async () => {
    if (businessId) {
      await prisma.inventoryMovement.deleteMany({ where: { businessId } });
      await prisma.accountingMovement.deleteMany({ where: { businessId } });
      await prisma.reservation.deleteMany({ where: { businessId } });
      await prisma.order.deleteMany({ where: { businessId } });
      await deleteBusinessFixtures(prisma, [businessId]);
    }
    if (unitId) await prisma.unit.delete({ where: { id: unitId } });
    if (app) await app.close();
  });

  const publicDto = (
    date: string,
    startMinute: number,
    itemId = service60,
  ) => ({
    itemId,
    customerName: 'Cliente concurrente',
    customerWhatsapp: '573001112233',
    date,
    startMinute,
    idempotencyKey: crypto.randomUUID(),
  });

  const activeAt = (itemId: string, date: string) =>
    prisma.reservation.findMany({
      where: {
        businessId,
        itemId,
        date: asDate(date),
        status: { not: 'CANCELLED' },
      },
      orderBy: { startMinute: 'asc' },
    });

  // Every new booking is policy 2. Tests of the historical rules (Bloques 0-2.1) turn a fresh
  // row into what a pre-2.2 row is: policy 1, PENDING, no confirmation date nor price snapshot.
  const asHistoricalV1 = (id: string) =>
    prisma.reservation.update({
      where: { id },
      data: { commercialPolicyVersion: 1, status: 'PENDING', confirmedAt: null, priceSnapshot: null },
    });

  const assertNoOverlaps = (
    rows: Array<{ startMinute: number; endMinute: number }>,
  ) => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].startMinute).toBeGreaterThanOrEqual(rows[i - 1].endMinute);
    }
  };

  it('mismo inicio: 8 solicitudes simultáneas por la tienda → una sola reserva', async () => {
    const date = futureDay(3);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        publicStore.createReservation(slug, publicDto(date, H(10)) as any),
      ),
    );
    const { fulfilled, rejected } = outcome(results);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const r of rejected)
      expect(r.reason).toBeInstanceOf(ConflictException);
    expect(await activeAt(service60, date)).toHaveLength(1);
  });

  it('inicios distintos con intervalos solapados → una sola reserva', async () => {
    const date = futureDay(4);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        publicStore.createReservation(
          slug,
          publicDto(date, i % 2 === 0 ? H(9) : H(10), service90) as any,
        ),
      ),
    );
    const { fulfilled, rejected } = outcome(results);
    expect(fulfilled).toHaveLength(1);
    for (const r of rejected)
      expect(r.reason).toBeInstanceOf(ConflictException);
    const rows = await activeAt(service90, date);
    expect(rows).toHaveLength(1);
    assertNoOverlaps(rows);
  });

  it('Reservas contra Ventas manual (espejo id = orderId): sin solapes ni órdenes huérfanas ni inventario', async () => {
    const date = futureDay(5);
    const tag = `Ventas-${date}`;
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { businessId },
    });

    const results = await Promise.allSettled([
      ...Array.from({ length: 3 }, () =>
        reservations.create(businessId, {
          itemId: service60,
          date,
          startMinute: H(11),
          endMinute: H(12),
        }),
      ),
      ...Array.from({ length: 3 }, () =>
        sales.create(businessId, {
          origin: 'MANUAL',
          type: 'SERVICIO',
          status: 'PENDIENTE',
          customerName: tag,
          paymentMethod: 'CASH',
          scheduledAt: `${date}T11:00`,
          items: [{ itemId: service60, quantity: 1 }],
        } as any),
      ),
    ]);
    const { fulfilled, rejected } = outcome(results);
    expect(fulfilled).toHaveLength(1);
    for (const r of rejected)
      expect(r.reason).toBeInstanceOf(ConflictException);
    expect(await activeAt(service60, date)).toHaveLength(1);

    // Every order created for this slot must own its mirror reservation (same id).
    const orders = await prisma.order.findMany({
      where: { businessId, customerName: tag },
    });
    for (const order of orders) {
      await expect(
        prisma.reservation.findUnique({ where: { id: order.id } }),
      ).resolves.not.toBeNull();
    }
    expect(orders.length).toBeLessThanOrEqual(1);
    expect(
      await prisma.inventoryMovement.count({ where: { businessId } }),
    ).toBe(movementsBefore);
  });

  it('dos reprogramaciones simultáneas hacia el mismo destino → una sola gana', async () => {
    const date = futureDay(6);
    const a = await reservations.create(businessId, {
      itemId: service60,
      date,
      startMinute: H(9),
      endMinute: H(10),
    });
    const b = await reservations.create(businessId, {
      itemId: service60,
      date,
      startMinute: H(11),
      endMinute: H(12),
    });

    const results = await Promise.allSettled(
      [a.id, b.id].map((id) =>
        reservations.reschedule(businessId, id, {
          date,
          startMinute: H(15),
          endMinute: H(16),
        }),
      ),
    );
    const { fulfilled, rejected } = outcome(results);
    expect(fulfilled).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    const rows = await activeAt(service60, date);
    expect(rows.filter((r) => r.startMinute === H(15))).toHaveLength(1);
    assertNoOverlaps(rows);
  });

  it('reprogramaciones simultáneas hacia inicios distintos que se solapan → una sola gana', async () => {
    const date = futureDay(15);
    const a = await reservations.create(businessId, {
      itemId: service90,
      date,
      startMinute: H(8),
      endMinute: H(9, 30),
    });
    const b = await reservations.create(businessId, {
      itemId: service90,
      date,
      startMinute: H(16),
      endMinute: H(17, 30),
    });

    const results = await Promise.allSettled([
      reservations.reschedule(businessId, a.id, {
        date,
        startMinute: H(11),
        endMinute: H(12, 30),
      }),
      reservations.reschedule(businessId, b.id, {
        date,
        startMinute: H(12),
        endMinute: H(13, 30),
      }),
    ]);
    const { fulfilled, rejected } = outcome(results);
    expect(fulfilled).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    assertNoOverlaps(await activeAt(service90, date));
  });

  it('reprogramación entre fechas contra creación en la fecha destino → una sola ocupa el turno', async () => {
    const source = futureDay(7);
    const target = futureDay(8);
    const moving = await reservations.create(businessId, {
      itemId: service60,
      date: source,
      startMinute: H(9),
      endMinute: H(10),
    });

    const results = await Promise.allSettled([
      reservations.reschedule(businessId, moving.id, {
        date: target,
        startMinute: H(10),
        endMinute: H(11),
      }),
      publicStore.createReservation(slug, publicDto(target, H(10)) as any),
      publicStore.createReservation(slug, publicDto(target, H(10)) as any),
    ]);
    expect(outcome(results).fulfilled).toHaveLength(1);
    expect(await activeAt(service60, target)).toHaveLength(1);
  });

  it('cancelación concurrente con creaciones nunca deja dos reservas activas en el mismo turno', async () => {
    const date = futureDay(9);
    const existing = await reservations.create(businessId, {
      itemId: service60,
      date,
      startMinute: H(12),
      endMinute: H(13),
    });

    await Promise.allSettled([
      reservations.cancel(businessId, existing.id),
      ...Array.from({ length: 4 }, () =>
        publicStore.createReservation(slug, publicDto(date, H(12)) as any),
      ),
    ]);
    const rows = await activeAt(service60, date);
    expect(rows.length).toBeLessThanOrEqual(1);
    assertNoOverlaps(rows);
  });

  it('una reserva cancelada no bloquea el mismo inicio (índice parcial)', async () => {
    const date = futureDay(10);
    const first = await publicStore.createReservation(
      slug,
      publicDto(date, H(14)) as any,
    );
    await reservations.cancel(businessId, first.id);
    await expect(
      publicStore.createReservation(slug, publicDto(date, H(14)) as any),
    ).resolves.toEqual(expect.objectContaining({ startMinute: H(14) }));
  });

  it('el índice parcial rechaza dos inicios activos iguales aun sin pasar por el servicio', async () => {
    const date = asDate(futureDay(11));
    const row = {
      businessId,
      itemId: service60,
      date,
      startMinute: H(16),
      endMinute: H(17),
    };
    await prisma.reservation.create({ data: { ...row, status: 'CANCELLED' } });
    await prisma.reservation.create({ data: { ...row, status: 'CANCELLED' } });
    await prisma.reservation.create({ data: row });
    await expect(
      prisma.reservation.create({ data: row }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('confirmar la reserva ganadora consume inventario una sola vez', async () => {
    const date = futureDay(12);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        publicStore.createReservation(slug, publicDto(date, H(9)) as any),
      ),
    );
    const winner = outcome(results).fulfilled[0] as PromiseFulfilledResult<{
      id: string;
    }>;
    expect(
      await prisma.inventoryMovement.count({
        where: { reservationId: winner.value.id },
      }),
    ).toBe(0);

    await asHistoricalV1(winner.value.id);
    await sales.confirmOrder(businessId, winner.value.id, 'RESERVATION');
    await sales.confirmOrder(businessId, winner.value.id, 'RESERVATION');

    expect(
      await prisma.inventoryMovement.count({
        where: { reservationId: winner.value.id },
      }),
    ).toBe(1);
    const reservation = await prisma.reservation.findUnique({
      where: { id: winner.value.id },
    });
    expect(reservation?.status).toBe('CONFIRMED');
  });

  it('Ventas: edición administrativa del espejo conserva el turno; moverlo a uno ocupado da 409 sin cambios', async () => {
    const date = futureDay(13);
    const order = await sales.create(businessId, {
      origin: 'MANUAL',
      type: 'SERVICIO',
      status: 'PENDIENTE',
      customerName: 'Edición',
      paymentMethod: 'CASH',
      scheduledAt: `${date}T09:00`,
      items: [{ itemId: service60, quantity: 1 }],
    } as any);
    await reservations.create(businessId, {
      itemId: service60,
      date,
      startMinute: H(10),
      endMinute: H(11),
    });
    const items = [{ itemId: service60, quantity: 1 }];

    await sales.update(businessId, order.id, {
      customerName: 'Editado',
      scheduledAt: `${date}T09:00`,
      items,
    } as any);
    let mirror = await prisma.reservation.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(mirror).toEqual(
      expect.objectContaining({
        customerName: 'Editado',
        startMinute: H(9),
        endMinute: H(10),
        // Editing never sends a policy 2 mirror back to PENDING.
        status: 'CONFIRMED',
        commercialPolicyVersion: 2,
      }),
    );

    await expect(
      sales.update(businessId, order.id, {
        scheduledAt: `${date}T10:00`,
        items,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    mirror = await prisma.reservation.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(mirror.startMinute).toBe(H(9));

    await sales.update(businessId, order.id, {
      scheduledAt: `${date}T13:00`,
      items,
    } as any);
    mirror = await prisma.reservation.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(mirror).toEqual(
      expect.objectContaining({ startMinute: H(13), endMinute: H(14) }),
    );
  });

  it('rechaza endMinute manipulado y turnos fuera de horario contra la base real', async () => {
    const date = futureDay(14);
    await expect(
      publicStore.createReservation(slug, {
        ...publicDto(date, H(9)),
        endMinute: H(12),
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      publicStore.createReservation(slug, publicDto(date, H(19)) as any),
    ).resolves.toBeDefined();
    await expect(
      publicStore.createReservation(
        slug,
        publicDto(date, H(19), service90) as any,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  describe('Cancelación (Bloque 1.1)', () => {
    const stock = async () =>
      Number(
        (
          await prisma.ingredient.findUniqueOrThrow({
            where: { id: ingredientId },
          })
        ).currentStock,
      );
    const inventoryOf = async (where: Record<string, unknown>) => {
      const rows = await prisma.inventoryMovement.findMany({
        where: { businessId, ...where },
      });
      return {
        sale: rows.filter((r) => r.type === 'SALE'),
        returns: rows.filter((r) => r.type === 'SALE_RETURN'),
      };
    };
    /** Real ledger rows for one origin: originals, reversals and per-account balance. */
    const ledgerOf = async (originId: string) => {
      const rows = await prisma.accountingMovement.findMany({
        where: { businessId, originType: 'ORDER', originId },
        orderBy: { createdAt: 'asc' },
      });
      const isReversal = (r: (typeof rows)[number]) =>
        (r.accountingRole ?? '').startsWith('SALE_REVERSAL:');
      const balance = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.pucCuentaCode}|${r.pucSubcuentaId ?? ''}`;
        const signed = Number(r.amount) * (r.nature === 'DEBIT' ? 1 : -1);
        balance.set(key, (balance.get(key) ?? 0) + signed);
      }
      return {
        originals: rows.filter((r) => !isReversal(r)),
        reversals: rows.filter(isReversal),
        balance,
      };
    };
    const expectFullyReversed = async (originId: string) => {
      const ledger = await ledgerOf(originId);
      expect(ledger.originals.length).toBeGreaterThan(0);
      expect(ledger.reversals).toHaveLength(ledger.originals.length);
      for (const original of ledger.originals) {
        const reversal = ledger.reversals.find(
          (r) => r.accountingRole === `SALE_REVERSAL:${original.id}`,
        );
        expect(reversal).toBeDefined();
        expect(Number(reversal!.amount)).toBe(Number(original.amount));
        expect(reversal!.nature).not.toBe(original.nature);
        expect(reversal!.pucCuentaCode).toBe(original.pucCuentaCode);
      }
      for (const value of ledger.balance.values())
        expect(Math.abs(value)).toBeLessThan(1e-9);
      return ledger;
    };

    it('ciclo completo: confirmar, cancelar con reversión real, idempotencia y volver a reservar el mismo turno', async () => {
      const date = futureDay(20);
      const booked = await publicStore.createReservation(
        slug,
        publicDto(date, H(9)) as any,
      );
      await asHistoricalV1(booked.id);
      const stockBefore = await stock();

      // 1. Confirm a PENDING reservation (commercial confirmation).
      await sales.confirmOrder(businessId, booked.id, 'RESERVATION');
      let row = await prisma.reservation.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(row.status).toBe('CONFIRMED');
      expect(
        (await inventoryOf({ reservationId: booked.id })).sale,
      ).toHaveLength(1);
      expect(await stock()).toBe(stockBefore - 1);
      const confirmedLedger = await ledgerOf(booked.id);
      expect(confirmedLedger.originals.length).toBeGreaterThan(0);
      expect(confirmedLedger.reversals).toHaveLength(0);

      // Unauthorized routes cannot cancel a CONFIRMED reservation.
      await expect(
        reservations.cancel(businessId, booked.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        publicStore.cancelReservation(booked.id, booked.publicToken!),
      ).rejects.toBeInstanceOf(ConflictException);

      // 3. Ventas cancels it: inventory returned and accounting counter-posted.
      await sales.cancel(businessId, booked.id, 'RESERVATION');
      row = await prisma.reservation.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(row.status).toBe('CANCELLED');
      const inv = await inventoryOf({ reservationId: booked.id });
      expect(inv.returns).toHaveLength(1);
      expect(Number(inv.returns[0].quantity)).toBe(
        Number(inv.sale[0].quantity),
      );
      expect(await stock()).toBe(stockBefore);
      const ledger = await expectFullyReversed(booked.id);
      // Originals untouched (same ids, amounts and natures as before the cancel).
      expect(
        ledger.originals.map((m) => [m.id, Number(m.amount), m.nature]),
      ).toEqual(
        confirmedLedger.originals.map((m) => [
          m.id,
          Number(m.amount),
          m.nature,
        ]),
      );

      // A second cancel (any route) adds nothing.
      await sales.cancel(businessId, booked.id, 'RESERVATION');
      await reservations.cancel(businessId, booked.id);
      await publicStore.cancelReservation(booked.id, booked.publicToken!);
      expect(
        (await inventoryOf({ reservationId: booked.id })).returns,
      ).toHaveLength(1);
      expect((await ledgerOf(booked.id)).reversals).toHaveLength(
        ledger.reversals.length,
      );

      // 6. A cancelled reservation cannot be confirmed (Ventas nor the direct route).
      await expect(
        sales.confirmOrder(businessId, booked.id, 'RESERVATION'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        controller.confirm({ user: { businessId } }, booked.id),
      ).rejects.toBeInstanceOf(ConflictException);

      // 4-5. Same date and start can be booked again; both rows remain.
      const rebooked = await publicStore.createReservation(
        slug,
        publicDto(date, H(9)) as any,
      );
      const rows = await prisma.reservation.findMany({
        where: {
          businessId,
          itemId: service60,
          date: asDate(date),
          startMinute: H(9),
        },
      });
      expect(rows.map((r) => [r.id, r.status]).sort()).toEqual(
        [
          [booked.id, 'CANCELLED'],
          // New bookings are policy 2: born CONFIRMED.
          [rebooked.id, 'CONFIRMED'],
        ].sort(),
      );
    });

    it('cancelar PENDING por Reservas, Tienda (con token) y Ventas libera el turno', async () => {
      const date = futureDay(21);
      const viaReservations = await reservations.create(businessId, {
        itemId: service60,
        date,
        startMinute: H(9),
        endMinute: H(10),
      });
      const viaStore = await publicStore.createReservation(
        slug,
        publicDto(date, H(11)) as any,
      );
      const viaSales = await reservations.create(businessId, {
        itemId: service60,
        date,
        startMinute: H(13),
        endMinute: H(14),
      });

      for (const id of [viaReservations.id, viaStore.id, viaSales.id])
        await asHistoricalV1(id);
      await reservations.cancel(businessId, viaReservations.id);
      await publicStore.cancelReservation(viaStore.id, viaStore.publicToken!);
      await sales.cancel(businessId, viaSales.id, 'RESERVATION');

      expect(await activeAt(service60, date)).toHaveLength(0);
      const slots = await reservations.getAvailability(
        businessId,
        service60,
        date,
      );
      expect(JSON.stringify(slots)).toContain('"09:00"');
      expect(JSON.stringify(slots)).toContain('"11:00"');
      expect(JSON.stringify(slots)).toContain('"13:00"');
    });

    it('Tienda: cancelar exige el token de la reserva y la búsqueda por teléfono no lo expone', async () => {
      const date = futureDay(22);
      const booked = await publicStore.createReservation(
        slug,
        publicDto(date, H(10)) as any,
      );
      expect(booked.publicToken).toBeTruthy();

      await expect(
        publicStore.cancelReservation(booked.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        publicStore.cancelReservation(booked.id, 'token-ajeno'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        (
          await prisma.reservation.findUniqueOrThrow({
            where: { id: booked.id },
          })
        ).status,
      ).toBe('CONFIRMED');

      const lookup = await publicStore.findReservationsByPhone(
        slug,
        '3001112233',
      );
      expect(lookup.length).toBeGreaterThan(0);
      for (const r of lookup) expect(r).not.toHaveProperty('publicToken');
    });

    it('PATCH /reservations/:id/confirm aplica la confirmación comercial (inventario + contabilidad)', async () => {
      const date = futureDay(23);
      const booked = await reservations.create(businessId, {
        itemId: service60,
        date,
        startMinute: H(9),
        endMinute: H(10),
      });
      await asHistoricalV1(booked.id);
      await controller.confirm({ user: { businessId } }, booked.id);

      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: booked.id },
      });
      expect(row.status).toBe('CONFIRMED');
      expect(row.inventoryPostedAt).not.toBeNull();
      expect(
        (await inventoryOf({ reservationId: booked.id })).sale,
      ).toHaveLength(1);
      expect((await ledgerOf(booked.id)).originals.length).toBeGreaterThan(0);
    });

    it('carrera confirmar contra cancelar: siempre termina CANCELLED con inventario y contabilidad en neto cero', async () => {
      const date = futureDay(24);
      const ids: string[] = [];
      for (const start of [H(8), H(10), H(12), H(14), H(16)]) {
        ids.push(
          (
            await reservations.create(businessId, {
              itemId: service60,
              date,
              startMinute: start,
              endMinute: start + 60,
            })
          ).id,
        );
      }
      for (const id of ids) await asHistoricalV1(id);
      const stockBefore = await stock();

      await Promise.all(
        ids.map((id, i) =>
          Promise.allSettled(
            i % 2 === 0
              ? [
                  sales.confirmOrder(businessId, id, 'RESERVATION'),
                  sales.cancel(businessId, id, 'RESERVATION'),
                ]
              : [
                  sales.cancel(businessId, id, 'RESERVATION'),
                  sales.confirmOrder(businessId, id, 'RESERVATION'),
                ],
          ),
        ),
      );

      for (const id of ids) {
        const row = await prisma.reservation.findUniqueOrThrow({
          where: { id },
        });
        expect(row.status).toBe('CANCELLED');
        const inv = await inventoryOf({ reservationId: id });
        expect(inv.returns).toHaveLength(inv.sale.length);
        const ledger = await ledgerOf(id);
        expect(ledger.reversals).toHaveLength(ledger.originals.length);
        for (const value of ledger.balance.values())
          expect(Math.abs(value)).toBeLessThan(1e-9);
      }
      expect(await stock()).toBe(stockBefore);
    });

    it('espejo de venta confirmada: no se cancela como reserva; la reversión de la orden lo libera sin duplicar', async () => {
      const date = futureDay(25);
      const order = await sales.create(businessId, {
        origin: 'MANUAL',
        type: 'SERVICIO',
        status: 'PENDIENTE',
        customerName: 'Espejo cancelación',
        paymentMethod: 'CASH',
        scheduledAt: `${date}T09:00`,
        items: [{ itemId: service60, quantity: 1 }],
      } as any);
      await asHistoricalV1(order.id);
      await sales.confirmOrder(businessId, order.id, 'ORDER');
      let mirror = await prisma.reservation.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(mirror.status).toBe('CONFIRMED');
      const invBefore = await inventoryOf({ orderId: order.id });
      const ledgerBefore = await ledgerOf(order.id);

      for (const attempt of [
        () => reservations.cancel(businessId, order.id),
        () => publicStore.cancelReservation(order.id, mirror.publicToken!),
        () => sales.cancel(businessId, order.id, 'RESERVATION'),
        () => controller.confirm({ user: { businessId } }, order.id),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(ConflictException);
      }
      expect((await inventoryOf({ orderId: order.id })).sale).toHaveLength(
        invBefore.sale.length,
      );
      expect(
        (await inventoryOf({ reservationId: order.id })).sale,
      ).toHaveLength(0);
      expect((await ledgerOf(order.id)).originals).toHaveLength(
        ledgerBefore.originals.length,
      );

      await sales.reverseConfirmedOrder(businessId, order.id, {
        reason: 'Cliente canceló',
      } as any);
      const reversedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(reversedOrder.status).toBe('CANCELLED');
      mirror = await prisma.reservation.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(mirror.status).toBe('CANCELLED');
      expect(await prisma.reservation.count({ where: { id: order.id } })).toBe(
        1,
      );
      const inv = await inventoryOf({ orderId: order.id });
      expect(inv.returns).toHaveLength(inv.sale.length);
      await expectFullyReversed(order.id);

      // The freed slot is bookable again; the mirror and its order keep their ids.
      await expect(
        reservations.create(businessId, {
          itemId: service60,
          date,
          startMinute: H(9),
          endMinute: H(10),
        }),
      ).resolves.toEqual(expect.objectContaining({ startMinute: H(9) }));
    });

    it('cancelar una CONFIRMED en paralelo con nuevas reservas del mismo turno nunca deja dos activas', async () => {
      const date = futureDay(26);
      const booked = await reservations.create(businessId, {
        itemId: service60,
        date,
        startMinute: H(15),
        endMinute: H(16),
      });
      await asHistoricalV1(booked.id);
      await sales.confirmOrder(businessId, booked.id, 'RESERVATION');

      await Promise.allSettled([
        sales.cancel(businessId, booked.id, 'RESERVATION'),
        ...Array.from({ length: 4 }, () =>
          publicStore.createReservation(slug, publicDto(date, H(15)) as any),
        ),
      ]);
      let active = await activeAt(service60, date);
      expect(active.length).toBeLessThanOrEqual(1);
      if (active.length === 0) {
        await publicStore.createReservation(
          slug,
          publicDto(date, H(15)) as any,
        );
        active = await activeAt(service60, date);
      }
      expect(active).toHaveLength(1);
      expect(
        (
          await prisma.reservation.findUniqueOrThrow({
            where: { id: booked.id },
          })
        ).status,
      ).toBe('CANCELLED');
      await expectFullyReversed(booked.id);
    });
  });

  describe('Bloque 2.0: fechas, servicios agendados y multiempresa', () => {
    const serviceSale = (date: string, time: string, extra: object = {}) =>
      ({
        origin: 'MANUAL',
        type: 'SERVICIO',
        status: 'PENDIENTE',
        customerName: 'Bloque 2.0',
        paymentMethod: 'CASH',
        scheduledAt: `${date}T${time}`,
        items: [{ itemId: service90, quantity: 1 }],
        ...extra,
      }) as any;
    const bogotaDay = (value: Date | string) =>
      new Date(value).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      });

    it('tienda y Ventas: el listado conserva createdAt de hoy y scheduledAt del día del servicio', async () => {
      const date = futureDay(31);
      const booked = await publicStore.createReservation(
        slug,
        publicDto(date, H(9), service90) as any,
      );
      const order = await sales.create(businessId, serviceSale(date, '12:00'));

      const all = await sales.findAll(businessId);
      const fromStore = all.find((s) => s.id === booked.id);
      const fromSales = all.filter((s) => s.id === order.id);
      expect(fromStore).toEqual(
        expect.objectContaining({
          sourceType: 'RESERVATION',
          status: 'CONFIRMADO',
          scheduledAt: `${date}T09:00:00`,
        }),
      );
      // The mirror is listed once, as the ORDER, carrying the appointment date.
      expect(fromSales).toHaveLength(1);
      expect(fromSales[0]).toEqual(
        expect.objectContaining({
          sourceType: 'ORDER',
          scheduledAt: `${date}T12:00:00`,
        }),
      );
      expect(bogotaDay(fromStore.createdAt)).toBe(futureDay(0));
      expect(bogotaDay(fromSales[0].createdAt)).toBe(futureDay(0));
      const mirror = await prisma.reservation.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(mirror).toEqual(
        expect.objectContaining({
          date: asDate(date),
          startMinute: H(12),
          status: 'CONFIRMED',
        }),
      );
    });

    it('venta de varios ítems con un servicio agendado: 400 explícito, sin orden ni turno ocupado', async () => {
      const date = futureDay(32);
      const product = await prisma.item.create({
        data: {
          businessId,
          name: 'Producto B2.0',
          type: ItemType.PRODUCT,
          price: 500,
        },
      });
      const before = await prisma.order.count({ where: { businessId } });
      for (const items of [
        [
          { itemId: service90, quantity: 1 },
          { itemId: product.id, quantity: 1 },
        ],
        [{ itemId: product.id, quantity: 1 }],
      ]) {
        await expect(
          sales.create(businessId, serviceSale(date, '09:00', { items })),
        ).rejects.toThrow('Un servicio con turno debe registrarse solo');
      }
      expect(await prisma.order.count({ where: { businessId } })).toBe(before);
      expect(await activeAt(service90, date)).toHaveLength(0);

      // Editing a scheduled service into a multi-item sale is rejected too; the slot stays.
      const order = await sales.create(businessId, serviceSale(date, '09:00'));
      await expect(
        sales.update(businessId, order.id, {
          scheduledAt: `${date}T09:00`,
          items: [
            { itemId: service90, quantity: 1 },
            { itemId: product.id, quantity: 1 },
          ],
        } as any),
      ).rejects.toThrow('Un servicio con turno debe registrarse solo');
      expect(
        await prisma.orderItem.count({ where: { orderId: order.id } }),
      ).toBe(1);
      expect(
        (
          await prisma.reservation.findUniqueOrThrow({
            where: { id: order.id },
          })
        ).status,
      ).toBe('CONFIRMED');

      // Products without agenda keep working.
      await expect(
        sales.create(businessId, {
          origin: 'MANUAL',
          customerName: 'Solo producto',
          paymentMethod: 'CASH',
          items: [{ itemId: product.id, quantity: 2 }],
        } as any),
      ).resolves.toEqual(expect.objectContaining({ sourceType: 'ORDER' }));
    });

    it('ORDER y RESERVATION no se confunden; los errores llegan en español', async () => {
      const date = futureDay(33);
      const order = await sales.create(businessId, serviceSale(date, '09:00'));
      await asHistoricalV1(order.id);
      await sales.confirmOrder(businessId, order.id, 'ORDER');
      await expect(sales.cancel(businessId, order.id, 'ORDER')).rejects.toThrow(
        'Una venta confirmada no se puede cancelar. Usá «Revertir venta».',
      );
      await expect(
        sales.cancel(businessId, order.id, 'RESERVATION'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        sales.cancel(
          businessId,
          '00000000-0000-0000-0000-000000000000',
          'ORDER',
        ),
      ).rejects.toThrow('Venta no encontrada');
    });

    it('aislamiento: otro negocio no ve, cancela ni toma prestado el turno de este negocio', async () => {
      const date = futureDay(34);
      const booked = await publicStore.createReservation(
        slug,
        publicDto(date, H(15), service90) as any,
      );
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const other = await createBusinessFixture(prisma, {
        data: {
          name: 'Otro negocio B2.0',
          slug: `otro-b20-${suffix}`,
          fiscalId: `test-other-${suffix}`,
          phoneWhatsapp: '0000000001',
        },
      });
      try {
        const otherService = await prisma.item.create({
          data: {
            businessId: other.id,
            name: 'Servicio ajeno',
            type: ItemType.SERVICE,
            price: 700,
            durationMinutes: 30,
          },
        });
        // Same id as this business's reservation: the untenanted lookup leaked its slot.
        await prisma.order.create({
          data: {
            id: booked.id,
            businessId: other.id,
            status: 'SENT',
            origin: 'MANUAL',
            total: 700,
            items: {
              create: {
                businessId: other.id,
                itemId: otherService.id,
                quantity: 1,
                itemNameSnapshot: 'Servicio ajeno',
                itemTypeSnapshot: ItemType.SERVICE,
                unitPrice: 700,
                lineTotal: 700,
              },
            },
          },
        });

        const otherList = await sales.findAll(other.id);
        expect(otherList).toHaveLength(1);
        expect(otherList[0].scheduledAt).toBeUndefined();
        expect(
          (await sales.getOne(other.id, booked.id)).scheduledAt,
        ).toBeUndefined();
        await expect(
          sales.cancel(other.id, booked.id, 'RESERVATION'),
        ).rejects.toThrow('Reserva no encontrada');

        const mine = (await sales.findAll(businessId)).filter(
          (s) => s.id === booked.id,
        );
        expect(mine).toEqual([
          expect.objectContaining({
            sourceType: 'RESERVATION',
            scheduledAt: `${date}T15:00:00`,
          }),
        ]);
        expect(
          (
            await prisma.reservation.findUniqueOrThrow({
              where: { id: booked.id },
            })
          ).status,
        ).toBe('CONFIRMED');
      } finally {
        await prisma.order.deleteMany({ where: { businessId: other.id } });
        await prisma.item.deleteMany({ where: { businessId: other.id } });
        await deleteBusinessFixtures(prisma, [other.id]);
      }
    });

    it('ORDER con espejo: se cancela como ORDER (libera turno); el espejo nunca se lista como RESERVATION', async () => {
      const date = futureDay(35);
      const order = await sales.create(businessId, serviceSale(date, '10:00'));

      // The mirror id cannot be cancelled as a standalone reservation.
      await expect(
        sales.cancel(businessId, order.id, 'RESERVATION'),
      ).rejects.toBeInstanceOf(ConflictException);
      await sales.cancel(businessId, order.id, 'ORDER');
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
          .status,
      ).toBe('CANCELLED');
      expect(await activeAt(service90, date)).toHaveLength(0);

      // «Eliminar» archives (no physical delete) and the mirror must not resurface.
      await sales.remove(businessId, order.id, 'ORDER');
      const listed = (
        await sales.findAll(businessId, { includeCancelled: true })
      ).filter((s) => s.id === order.id);
      expect(listed).toEqual([]);
      expect(
        await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      ).toEqual(
        expect.objectContaining({ archived: true, status: 'CANCELLED' }),
      );
      expect(
        await prisma.reservation.findUniqueOrThrow({ where: { id: order.id } }),
      ).toEqual(expect.objectContaining({ status: 'CANCELLED' }));
      expect(
        await prisma.inventoryMovement.count({ where: { orderId: order.id } }),
      ).toBe(0);
    });
  });
  describe('Bloque 2.1: prestación explícita y finalización', () => {
    let fixtureDay = 100;
    async function pending(itemId = service90) {
      return prisma.reservation.create({ data: { businessId, itemId, date: asDate(futureDay(-fixtureDay++)), startMinute: 600, endMinute: 690, status: 'PENDING' } });
    }
    async function confirmed(itemId = service90) {
      const r = await pending(itemId);
      await sales.confirmOrder(businessId, r.id, 'RESERVATION');
      return prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
    }
    async function effects(id: string) {
      return {
        inventory: await prisma.inventoryMovement.findMany({ where: { businessId, OR: [{ reservationId: id }, { orderId: id }] }, orderBy: { id: 'asc' } }),
        accounting: await prisma.accountingMovement.findMany({ where: { businessId, originId: id }, orderBy: { id: 'asc' } }),
        fiscal: await prisma.fiscalDocument.findMany({ where: { businessId, orderId: id }, orderBy: { id: 'asc' } }),
        stock: await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }),
      };
    }
    it.each([undefined, false, 'true'])('rechaza falta de declaración explícita: %s', async value => {
      const r = await confirmed();
      await expect(sales.completeReservation(businessId, r.id, value)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SERVICE_PROVISION_CONFIRMATION_REQUIRED' }) });
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('CONFIRMED');
    });
    it.each([false, true])('finaliza sin repetir efectos; consumo=%s', async consume => {
      const r = await confirmed(consume ? service60 : service90);
      const before = await effects(r.id);
      expect(before.inventory.length).toBe(consume ? 1 : 0);
      const result = await sales.completeReservation(businessId, r.id, true);
      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.allowedActions).not.toContain('cancel');
      expect(await effects(r.id)).toEqual(before);
      const again = await sales.completeReservation(businessId, r.id, true);
      expect(again.completedAt).toEqual(result.completedAt);
      expect(again.alreadyCompleted).toBe(true);
      await expect(sales.confirmOrder(businessId, r.id, 'RESERVATION')).rejects.toMatchObject({ status: 409 });
      await expect(sales.cancel(businessId, r.id, 'RESERVATION')).rejects.toMatchObject({ status: 409 });
      await expect(sales.remove(businessId, r.id, 'RESERVATION')).rejects.toMatchObject({ status: 400 });
    });
    it('histórico conserva confirmedAt desconocido, acepta asiento cero y no infiere atención', async () => {
      const r = await confirmed();
      await prisma.reservation.update({ where: { id: r.id }, data: { confirmedAt: null } });
      const original = await prisma.accountingMovement.findFirstOrThrow({ where: { businessId, originId: r.id } });
      await prisma.accountingMovement.create({ data: { businessId, originType: 'ORDER', originId: r.id, amount: 0, nature: original.nature, date: original.date, pucCuentaCode: original.pucCuentaCode, pucSubcuentaId: original.pucSubcuentaId } });
      const before = await effects(r.id);
      const result = await sales.completeReservation(businessId, r.id, true);
      expect(result.confirmedAt).toBeNull();
      expect(await effects(r.id)).toEqual(before);
    });
    it('evidencia ausente bloquea finalizar pero conserva cancelar; aislado entre negocios', async () => {
      const r = await pending();
      await prisma.reservation.update({ where: { id: r.id }, data: { status: 'CONFIRMED', inventoryPostedAt: new Date() } });
      await expect(sales.completeReservation(businessId, r.id, true)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'COMMERCIAL_EVIDENCE_INCONSISTENT' }) });
      const row = (await sales.findAll(businessId)).find(sale => sale.id === r.id)!;
      expect(row.allowedActions).toContain('cancel');
      expect(row.allowedActions).not.toContain('complete');
      await expect(sales.completeReservation('another-business', r.id, true)).rejects.toBeDefined();
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('CONFIRMED');
    });
    it('dos finalizaciones concurrentes conservan la misma fecha y los movimientos', async () => {
      const r = await confirmed(service60); const before = await effects(r.id);
      const results = await Promise.all([sales.completeReservation(businessId, r.id, true), sales.completeReservation(businessId, r.id, true)]);
      expect(results[0].completedAt).toEqual(results[1].completedAt);
      expect(await effects(r.id)).toEqual(before);
    });
    it('finalizar contra cancelar serializa sin dejar COMPLETED revertida', async () => {
      const r = await confirmed(service60);
      const results = await Promise.allSettled([sales.completeReservation(businessId, r.id, true), sales.cancel(businessId, r.id, 'RESERVATION')]);
      expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
      const row = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } });
      const after = await effects(r.id);
      expect(after.inventory.some(x => x.type === 'SALE_RETURN')).toBe(row.status === 'CANCELLED');
    });
    it('reprogramar contra finalizar no mueve una reserva confirmada', async () => {
      const r = await confirmed();
      const result = await Promise.allSettled([sales.completeReservation(businessId, r.id, true), reservations.reschedule(businessId, r.id, { date: futureDay(80), startMinute: 600, endMinute: 690 })]);
      expect(result[0].status).toBe('fulfilled'); expect(result[1].status).toBe('rejected');
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).date).toEqual(r.date);
    });
    async function mirror() {
      const order = await sales.create(businessId, { origin: 'MANUAL', type: 'SERVICIO', scheduledAt: `${futureDay(100 + fixtureDay++)}T10:00:00`, items: [{ itemId: service90, quantity: 1 }] } as any);
      await asHistoricalV1(order.id);
      await sales.confirmOrder(businessId, order.id);
      await prisma.reservation.update({ where: { id: order.id }, data: { date: asDate(futureDay(-fixtureDay++)) } });
      return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    }
    it('neto recibido cero conserva el contrato contable existente al finalizar', async () => {
      const created = await sales.create(businessId, { origin: 'MANUAL', type: 'SERVICIO', scheduledAt: `${futureDay(100 + fixtureDay++)}T10:00:00`, items: [{ itemId: service90, quantity: 1 }] } as any);
      await asHistoricalV1(created.id);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
      await prisma.orderFiscalContext.create({ data: { orderId: order.id, subtotal: order.total, netReceived: 0, withheldTaxTotal: order.total } });
      await prisma.saleTaxLine.create({ data: { orderId: order.id, taxType: 'RETEFUENTE', direction: 'WITHHOLD', baseAmount: order.total, rate: 1, taxAmount: order.total, accountCode: '1355' } });
      await sales.confirmOrder(businessId, order.id);
      await prisma.reservation.update({ where: { id: order.id }, data: { date: asDate(futureDay(-fixtureDay++)) } });
      const before = await effects(order.id);
      expect((await prisma.orderFiscalContext.findUniqueOrThrow({ where: { orderId: order.id } })).netReceived.toNumber()).toBe(0);
      await sales.completeReservation(businessId, order.id, true);
      expect(await effects(order.id)).toEqual(before);
    });
    it('no permite ocultar una reserva pendiente con efectos comerciales', async () => {
      const r = await confirmed();
      await prisma.reservation.update({where:{id:r.id},data:{status:'PENDING'}});
      const row = (await sales.findAll(businessId)).find(s=>s.id===r.id)!;
      expect(row.allowedActions).not.toContain('delete');
      await expect(sales.remove(businessId,r.id,'RESERVATION')).rejects.toMatchObject({response:expect.objectContaining({code:'COMMERCIAL_EFFECTS_PENDING'})});
      expect((await prisma.reservation.findUniqueOrThrow({where:{id:r.id}})).archived).toBe(false);
    });
    it('finaliza espejo sin escribir Order ni modificar Factus, contabilidad o inventario', async () => {
      const order = await mirror(); const before = await effects(order.id);
      await sales.completeReservation(businessId, order.id, true);
      expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order);
      expect(await effects(order.id)).toEqual(before);
      expect((await sales.findAll(businessId)).find(s => s.id === order.id)?.reservationStatus).toBe('COMPLETED');
    });
    it('finalizar espejo contra revertir respeta Order -> Reservation y conserva completedAt', async () => {
      const order = await mirror();
      const result = await Promise.allSettled([sales.completeReservation(businessId, order.id, true), sales.reverseConfirmedOrder(businessId, order.id, { reason: 'prueba' })]);
      expect(result.some(r => r.status === 'fulfilled')).toBe(true);
      const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const r = await prisma.reservation.findUniqueOrThrow({ where: { id: order.id } });
      if (current.status === 'CANCELLED') expect(r.status).toBe('CANCELLED');
      else expect(r.status).toBe('COMPLETED');
      if (result[0].status === 'fulfilled') expect(r.completedAt).not.toBeNull();
      for (const rejected of result.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) expect(String(rejected.reason)).not.toMatch(/deadlock/i);
    });
    it('COMPLETED mantiene el indice de horario y bloquea finalizar una reserva futura', async () => {
      const r = await confirmed(); await sales.completeReservation(businessId, r.id, true);
      await expect(prisma.reservation.create({ data: { businessId, itemId: r.itemId, date: r.date, startMinute: r.startMinute, endMinute: r.endMinute } })).rejects.toMatchObject({ code: 'P2002' });
      const future = await confirmed();
      await prisma.reservation.update({ where: { id: future.id }, data: { date: asDate(futureDay(40)) } });
      await expect(sales.completeReservation(businessId, future.id, true)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESERVATION_NOT_STARTED' }) });
      await prisma.reservation.update({ where: { id: future.id }, data: { status: 'COMPLETED' } });
      expect(JSON.stringify(await reservations.getAvailability(businessId, future.itemId, futureDay(40)))).not.toContain('"10:00"');
      await expect(reservations.create(businessId, { itemId: future.itemId, date: futureDay(40), startMinute: 540 } as any)).rejects.toBeInstanceOf(ConflictException);
    });
    it('eliminar pendiente archiva y cancela sin revertir movimientos', async () => {
      const r = await pending(); const before = await effects(r.id);
      const result = await sales.remove(businessId, r.id, 'RESERVATION');
      expect(result.archived).toBe(true); expect(result.status).toBe('CANCELLED');
      expect(await effects(r.id)).toEqual(before);
    });
    it('cancelación conserva motivo y fecha al repetirse', async () => {
      const r = await pending();
      const first: any = await sales.cancel(businessId, r.id, 'RESERVATION', 'Pedido del cliente');
      const second: any = await sales.cancel(businessId, r.id, 'RESERVATION', 'Otro motivo');
      expect(second.cancelledAt).toEqual(first.cancelledAt); expect(second.cancelReason).toBe('Pedido del cliente');
    });
  });

  describe('Bloque 2.2: confirmación automática y registro comercial al finalizar', () => {
    let bizV2: string;
    let slugV2: string;
    let svcRecipe: string; // 30000, consumes 1 unit of `stocked`
    let svcPlain: string; // 20000, no recipe
    let svcFree: string; // 0, no recipe
    let svcFreeRecipe: string; // 0, consumes 1 unit of `stocked`
    let svcScarce: string; // 25000, consumes `scarce` (stock 0)
    let stocked: string;
    let scarce: string;
    let offset = 400;
    const nextFuture = () => futureDay(1 + (offset++ % 250));
    const nextPast = () => asDate(futureDay(-offset++));

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      slugV2 = `reservas-b22-${suffix}`;
      const business = await createBusinessFixture(prisma, {
        data: { name: 'Reservas politica 2', slug: slugV2, fiscalId: `test22-${suffix}`, phoneWhatsapp: '0000000000' },
      });
      bizV2 = business.id;
      // No flag: a freshly registered business (reservationPolicyV2Enabled = false) already uses policy 2.
      for (const [code, name, parent] of [['1110', 'Bancos', '11'], ['111005', 'Moneda nacional', '1110']] as const) {
        if (code.length === 4) await prisma.pucCuenta.upsert({ where: { code }, create: { code, name, grupoCode: parent }, update: {} });
        else await prisma.pucSubcuenta.upsert({ where: { code }, create: { code, name, cuentaCode: parent, active: true }, update: {} });
      }
      const ingredient = (name: string, currentStock: number) => prisma.ingredient.create({
        data: { businessId: bizV2, name, consumptionUnit: IngredientUnit.UNIT, purchaseUnit: IngredientUnit.UNIT, purchaseToConsumptionFactor: 1, stockUnitId: unitId, defaultPurchaseUnitId: unitId, currentStock, averageCost: 2 },
      });
      stocked = (await ingredient('Insumo v2', 100)).id;
      scarce = (await ingredient('Insumo agotado v2', 0)).id;
      const service = async (name: string, price: number, ingredientId?: string) => {
        const item = await prisma.item.create({ data: { businessId: bizV2, name, type: ItemType.SERVICE, price, durationMinutes: 60 } });
        await prisma.serviceScheduleWindow.createMany({ data: WEEKDAYS.map(weekday => ({ businessId: bizV2, itemId: item.id, weekday, startMinute: H(8), endMinute: H(20) })) });
        if (ingredientId) await prisma.serviceIngredient.create({ data: { businessId: bizV2, serviceItemId: item.id, ingredientId, quantityRequired: 1 } });
        return item.id;
      };
      svcRecipe = await service('Corte v2', 30000, stocked);
      svcPlain = await service('Asesoria v2', 20000);
      svcFree = await service('Diagnostico gratis', 0);
      svcFreeRecipe = await service('Muestra gratis', 0, stocked);
      svcScarce = await service('Tratamiento escaso', 25000, scarce);
    }, 60000);

    afterAll(async () => {
      if (!bizV2) return;
      await prisma.inventoryMovement.deleteMany({ where: { businessId: bizV2 } });
      await prisma.accountingMovement.deleteMany({ where: { businessId: bizV2 } });
      await prisma.reservation.deleteMany({ where: { businessId: bizV2 } });
      await prisma.order.deleteMany({ where: { businessId: bizV2 } });
      await deleteBusinessFixtures(prisma, [bizV2]);
    });

    const key = () => crypto.randomUUID();
    const dto = (itemId: string, date = nextFuture(), startMinute = H(10), customerName = 'Cliente v2') =>
      ({ itemId, customerName, customerWhatsapp: '573001112244', date, startMinute, idempotencyKey: key() }) as any;
    const book = (itemId: string) => publicStore.createReservation(slugV2, dto(itemId)) as Promise<any>;
    const started = (id: string) => prisma.reservation.update({ where: { id }, data: { date: nextPast() } });
    const row = (id: string) => prisma.reservation.findUniqueOrThrow({ where: { id } });
    const effects = async (id: string) => ({
      inventory: await prisma.inventoryMovement.findMany({ where: { businessId: bizV2, OR: [{ reservationId: id }, { orderId: id }] }, orderBy: { id: 'asc' } }),
      accounting: await prisma.accountingMovement.findMany({ where: { businessId: bizV2, originId: id }, orderBy: { id: 'asc' } }),
      fiscal: await prisma.fiscalDocument.findMany({ where: { businessId: bizV2, orderId: id } }),
    });
    const stockOf = async (id: string) => Number((await prisma.ingredient.findUniqueOrThrow({ where: { id } })).currentStock);
    const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });
    const mirror = async (itemId = svcRecipe, paymentMethod = 'CASH') =>
      sales.create(bizV2, { origin: 'MANUAL', type: 'SERVICIO', paymentMethod, scheduledAt: `${nextFuture()}T10:00:00`, items: [{ itemId, quantity: 1 }] } as any) as Promise<any>;

    describe('creación', () => {
      it('tienda pública: CONFIRMED v2 con precio pactado, ocupa el horario y no registra efectos', async () => {
        const booked = await book(svcRecipe);
        expect(booked.status).toBe('CONFIRMED');
        const r = await row(booked.id);
        expect(r).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2, paymentMethod: 'CASH', origin: 'PUBLIC_STORE' });
        expect(r.confirmedAt).toBeInstanceOf(Date);
        expect(Number(r.priceSnapshot)).toBe(30000);
        expect(await effects(r.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        await expect(reservations.create(bizV2, { itemId: svcRecipe, date: r.date.toISOString().slice(0, 10), startMinute: H(10) } as any)).rejects.toBeInstanceOf(ConflictException);
        const listed = (await sales.findAll(bizV2)).find(s => s.id === r.id)!;
        expect(listed).toMatchObject({ commercialPolicyVersion: 2, countsAsSale: false, total: 30000 });
        expect(listed.allowedActions).not.toContain('confirm');
      });
      it('reserva interna: CONFIRMED v2 sin efectos', async () => {
        const r = await reservations.create(bizV2, { itemId: svcPlain, date: nextFuture(), startMinute: H(11) } as any);
        expect(r).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2 });
        expect(Number(r.priceSnapshot)).toBe(20000);
        expect(await effects(r.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('venta manual: Order SENT + espejo CONFIRMED v2, sin efectos ni documentos fiscales', async () => {
        const order = await mirror();
        // The client must know it is a booking, so it never tries an early commercial close.
        expect(order.commercialPolicyVersion).toBe(2);
        expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SENT');
        const r = await row(order.id);
        expect(r).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2, priceSnapshot: null });
        expect(await effects(order.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('las rutas antiguas de confirmación rechazan el cierre anticipado sin efectos', async () => {
        const booked = await book(svcRecipe);
        const order = await mirror();
        await expect(sales.confirmOrder(bizV2, booked.id, 'RESERVATION')).rejects.toMatchObject(code('RESERVATION_USE_COMPLETE'));
        await expect(controller.confirm({ user: { businessId: bizV2 } }, booked.id)).rejects.toMatchObject(code('RESERVATION_USE_COMPLETE'));
        await expect(sales.confirmOrder(bizV2, order.id)).rejects.toMatchObject(code('RESERVATION_USE_COMPLETE'));
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        expect(await effects(order.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SENT');
      });
      it('la clave de idempotencia es obligatoria', async () => {
        const { idempotencyKey: _k, ...withoutKey } = dto(svcPlain);
        await expect(publicStore.createReservation(slugV2, withoutKey)).rejects.toMatchObject(code('IDEMPOTENCY_KEY_REQUIRED'));
      });
    });

    describe('finalización', () => {
      it.each([['CASH', '110505'], ['BANK_TRANSFER', '111005']])('registra una sola vez con %s, precio pactado y receta vigente', async (method, account) => {
        const booked = await book(svcRecipe);
        await sales.update(bizV2, booked.id, { paymentMethod: method } as any, 'RESERVATION');
        await prisma.item.update({ where: { id: svcRecipe }, data: { price: 99999 } });
        await started(booked.id);
        const before = await stockOf(stocked);
        try {
          const done: any = await sales.completeReservation(bizV2, booked.id, true);
          expect(done).toMatchObject({ status: 'COMPLETED', alreadyCompleted: false });
          const after = await effects(booked.id);
          expect(after.fiscal).toEqual([]);
          expect(after.inventory).toHaveLength(1);
          expect(after.inventory[0]).toMatchObject({ type: 'SALE', reservationId: booked.id });
          expect(await stockOf(stocked)).toBe(before - 1);
          const debit = after.accounting.find(m => m.nature === 'DEBIT' && m.pucSubcuentaId === account)!;
          expect(Number(debit.amount)).toBe(30000);
          const income = after.accounting.find(m => m.pucSubcuentaId === '413595')!;
          expect(Number(income.amount)).toBe(30000);
          expect(after.accounting.every(m => m.originType === 'ORDER' && m.originId === booked.id)).toBe(true);
          expect(after.accounting.some(m => m.pucCuentaCode === '6135' && m.nature === 'DEBIT')).toBe(true);
          const r = await row(booked.id);
          expect(r.accountingPostedAt).toBeInstanceOf(Date);
          expect(r.inventoryPostedAt).toBeInstanceOf(Date);
          const again: any = await sales.completeReservation(bizV2, booked.id, true);
          expect(again.alreadyCompleted).toBe(true);
          expect(again.completedAt).toEqual(done.completedAt);
          expect(await effects(booked.id)).toEqual(after);
          const listed = (await sales.findAll(bizV2)).find(s => s.id === booked.id)!;
          expect(listed).toMatchObject({ countsAsSale: true, reservationStatus: 'COMPLETED' });
          expect(listed.allowedActions).toEqual([]);
          await expect(sales.cancel(bizV2, booked.id, 'RESERVATION')).rejects.toMatchObject({ status: 409 });
          await expect(sales.remove(bizV2, booked.id, 'RESERVATION')).rejects.toBeDefined();
        } finally {
          await prisma.item.update({ where: { id: svcRecipe }, data: { price: 30000 } });
        }
      });
      it('usa la receta vigente al finalizar, no la del momento de reservar', async () => {
        const booked = await book(svcPlain); // no recipe when booked
        const link = await prisma.serviceIngredient.create({ data: { businessId: bizV2, serviceItemId: svcPlain, ingredientId: stocked, quantityRequired: 2 } });
        try {
          await started(booked.id);
          await sales.completeReservation(bizV2, booked.id, true);
          const after = await effects(booked.id);
          expect(after.inventory).toHaveLength(1);
          expect(Number(after.inventory[0].quantity)).toBe(2);
        } finally {
          await prisma.serviceIngredient.delete({ where: { id: link.id } });
        }
      });
      it('dos finalizaciones concurrentes registran una sola vez', async () => {
        const booked = await book(svcRecipe);
        await started(booked.id);
        const results = await Promise.allSettled([sales.completeReservation(bizV2, booked.id, true), sales.completeReservation(bizV2, booked.id, true)]);
        const ok = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
        expect(ok.length).toBeGreaterThanOrEqual(1);
        for (const rejected of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected'))
          expect(rejected.reason).toMatchObject(code('RESERVATION_CONCURRENT_MODIFICATION'));
        const after = await effects(booked.id);
        expect(after.inventory).toHaveLength(1);
        expect(after.accounting.filter(m => m.pucSubcuentaId === '413595')).toHaveLength(1);
        if (ok.length === 2) expect(ok[0].value.completedAt).toEqual(ok[1].value.completedAt);
      });
      it('stock insuficiente bloquea todo y deja la reserva CONFIRMED', async () => {
        const booked = await book(svcScarce);
        await started(booked.id);
        await expect(sales.completeReservation(bizV2, booked.id, true)).rejects.toMatchObject(code('INSUFFICIENT_STOCK_FOR_COMPLETION'));
        const r = await row(booked.id);
        expect(r).toMatchObject({ status: 'CONFIRMED', completedAt: null, accountingPostedAt: null, inventoryPostedAt: null });
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        expect(await stockOf(scarce)).toBe(0);
      });
      it('método de pago inválido: error estructurado sin fallback ni efectos', async () => {
        const booked = await book(svcPlain);
        await prisma.reservation.update({ where: { id: booked.id }, data: { paymentMethod: 'OTHER', date: nextPast() } });
        await expect(sales.completeReservation(bizV2, booked.id, true)).rejects.toMatchObject(code('INVALID_PAYMENT_METHOD'));
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('no finaliza antes del inicio ni desde otro negocio', async () => {
        const booked = await book(svcPlain);
        await expect(sales.completeReservation(bizV2, booked.id, true)).rejects.toMatchObject(code('RESERVATION_NOT_STARTED'));
        await started(booked.id);
        await expect(sales.completeReservation(businessId, booked.id, true)).rejects.toBeDefined();
        expect((await row(booked.id)).status).toBe('CONFIRMED');
      });
      it('gratuita sin receta: COMPLETED sin asientos y reintento válido', async () => {
        const booked = await book(svcFree);
        await started(booked.id);
        const done: any = await sales.completeReservation(bizV2, booked.id, true);
        expect(done.status).toBe('COMPLETED');
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        const again: any = await sales.completeReservation(bizV2, booked.id, true);
        expect(again.alreadyCompleted).toBe(true);
        expect((await sales.findAll(bizV2)).find(s => s.id === booked.id)?.countsAsSale).toBe(false);
      });
      it('gratuita con receta: consumo real y costo balanceado, sin ingreso', async () => {
        const booked = await book(svcFreeRecipe);
        await started(booked.id);
        await sales.completeReservation(bizV2, booked.id, true);
        const after = await effects(booked.id);
        expect(after.inventory).toHaveLength(1);
        expect(after.accounting.map(m => [m.pucCuentaCode ?? m.pucSubcuentaId, m.nature, Number(m.amount)]).sort()).toEqual([['1435', 'CREDIT', 2], ['6135', 'DEBIT', 2]]);
        await sales.completeReservation(bizV2, booked.id, true);
        expect(await effects(booked.id)).toEqual(after);
      });
      it('espejo: registra la Order (CASH/BANK) una vez, sin emitir Factus', async () => {
        const order = await mirror(svcRecipe, 'BANK_TRANSFER');
        await started(order.id);
        const done: any = await sales.completeReservation(bizV2, order.id, true);
        expect(done.status).toBe('COMPLETED');
        const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(o.status).toBe('COMPLETED');
        expect(o.accountingPostedAt).toBeInstanceOf(Date);
        expect(o.inventoryPostedAt).toBeInstanceOf(Date);
        const after = await effects(order.id);
        expect(after.fiscal.filter(d => d.type === 'INVOICE')).toEqual([]);
        expect(after.accounting.find(m => m.nature === 'DEBIT' && m.pucSubcuentaId === '111005')).toBeDefined();
        expect(after.inventory).toHaveLength(1);
        await sales.completeReservation(bizV2, order.id, true);
        expect(await effects(order.id)).toEqual(after);
        expect((await sales.findAll(bizV2)).find(s => s.id === order.id)?.countsAsSale).toBe(true);
      });
      it('espejo de importe cero: bloqueo seguro sin efectos', async () => {
        const order = await mirror(svcFree);
        await started(order.id);
        await expect(sales.completeReservation(bizV2, order.id, true)).rejects.toMatchObject(code('ZERO_AMOUNT_NOT_POSTABLE'));
        expect(await effects(order.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SENT');
      });
      it('finalizar contra cancelar: gana una, sin efectos huérfanos', async () => {
        const booked = await book(svcRecipe);
        await started(booked.id);
        const results = await Promise.allSettled([sales.completeReservation(bizV2, booked.id, true), sales.cancel(bizV2, booked.id, 'RESERVATION')]);
        expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
        const r = await row(booked.id);
        const after = await effects(booked.id);
        if (r.status === 'CANCELLED') expect(after).toEqual({ inventory: [], accounting: [], fiscal: [] });
        else { expect(r.status).toBe('COMPLETED'); expect(after.inventory).toHaveLength(1); }
      });
    });

    describe('cancelación, ausencia y eliminación', () => {
      it('cancelar desde Ventas libera el horario sin contraasientos', async () => {
        const booked = await book(svcRecipe);
        const r0 = await row(booked.id);
        const cancelled: any = await sales.cancel(bizV2, booked.id, 'RESERVATION', 'Pedido del cliente');
        expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Pedido del cliente' });
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        const again = await reservations.create(bizV2, { itemId: svcRecipe, date: r0.date.toISOString().slice(0, 10), startMinute: r0.startMinute } as any);
        expect(again.status).toBe('CONFIRMED');
        await expect(sales.cancel(bizV2, again.id, 'RESERVATION', 'no_show')).rejects.toMatchObject(code('RESERVED_CANCEL_REASON'));
        await expect(sales.cancel(bizV2, again.id, 'RESERVATION', 'MIRROR_DETACHED_BY_EDIT')).rejects.toMatchObject(code('RESERVED_CANCEL_REASON'));
      });
      it('cancelación pública: antes del inicio, idempotente, concurrente y con token propio', async () => {
        const booked = await book(svcPlain);
        await expect(publicStore.cancelReservation(booked.id, 'token-ajeno')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(publicStore.cancelReservation(booked.id, booked.publicToken, 'NO_SHOW')).rejects.toMatchObject(code('RESERVED_CANCEL_REASON'));
        const view = await publicStore.findReservationById(booked.id);
        expect(view).toMatchObject({ canCancel: true });
        expect(view).not.toHaveProperty('publicRequestId');
        const results = await Promise.all([publicStore.cancelReservation(booked.id, booked.publicToken), publicStore.cancelReservation(booked.id, booked.publicToken)]);
        expect(results.map((r: any) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
        expect((results[0] as any).cancelledAt).toEqual((results[1] as any).cancelledAt);
        expect(Object.keys(results[0] as any).sort()).toEqual(['cancelledAt', 'id', 'status']);
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('cancelación pública rechazada desde el inicio y para espejos', async () => {
        const booked = await book(svcPlain);
        await started(booked.id);
        expect((await publicStore.findReservationById(booked.id))?.canCancel).toBe(false);
        await expect(publicStore.cancelReservation(booked.id, booked.publicToken)).rejects.toMatchObject(code('PUBLIC_CANCEL_WINDOW_CLOSED'));
        const order = await mirror(svcPlain);
        const m = await row(order.id);
        expect((await publicStore.findReservationById(order.id))?.canCancel).toBe(false);
        await expect(publicStore.cancelReservation(order.id, m.publicToken!)).rejects.toBeInstanceOf(ConflictException);
        expect((await row(order.id)).status).toBe('CONFIRMED');
      });
      it('ausencia: antes del final rechazada; desde el final cancela con NO_SHOW sin efectos', async () => {
        const booked = await book(svcRecipe);
        await expect(sales.markNoShow(bizV2, booked.id, true)).rejects.toMatchObject(code('RESERVATION_NOT_ENDED'));
        await started(booked.id);
        await expect(sales.markNoShow(bizV2, booked.id, undefined)).rejects.toMatchObject(code('NO_SHOW_CONFIRMATION_REQUIRED'));
        await expect(sales.markNoShow(businessId, booked.id, true)).rejects.toBeDefined();
        const stockBefore = await stockOf(stocked);
        const marked: any = await controller.noShow({ user: { businessId: bizV2 } }, booked.id, { confirmed: true });
        expect(marked).toMatchObject({ status: 'CANCELLED', cancelReason: 'NO_SHOW' });
        expect(marked.cancelledAt).toBeInstanceOf(Date);
        expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
        expect(await stockOf(stocked)).toBe(stockBefore);
        const again: any = await sales.markNoShow(bizV2, booked.id, true);
        expect(again.cancelledAt).toEqual(marked.cancelledAt);
        const listed = (await sales.findAll(bizV2, { includeCancelled: true })).find(s => s.id === booked.id)!;
        expect(listed).toMatchObject({ reservationStatus: 'CANCELLED', cancelReason: 'NO_SHOW', countsAsSale: false });
      });
      it('ausencia de un espejo cancela la Order sin venta', async () => {
        const order = await mirror(svcRecipe);
        await started(order.id);
        await sales.markNoShow(bizV2, order.id, true);
        expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CANCELLED');
        expect(await row(order.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'NO_SHOW' });
        expect(await effects(order.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('una reserva histórica no admite registrar ausencia', async () => {
        const v1 = await prisma.reservation.create({ data: { businessId, itemId: service90, date: asDate(futureDay(-(offset++))), startMinute: 600, endMinute: 690, status: 'PENDING' } });
        await expect(sales.markNoShow(businessId, v1.id, true)).rejects.toMatchObject(code('POLICY_NOT_SUPPORTED'));
      });
      it('eliminar una reserva CONFIRMED sin efectos la cancela, archiva y libera el horario', async () => {
        const booked = await book(svcPlain);
        const r0 = await row(booked.id);
        const removed: any = await sales.remove(bizV2, booked.id, 'RESERVATION');
        expect(removed).toMatchObject({ archived: true, status: 'CANCELLED' });
        expect(removed.cancelledAt).toBeInstanceOf(Date);
        const rebooked = await reservations.create(bizV2, { itemId: svcPlain, date: r0.date.toISOString().slice(0, 10), startMinute: r0.startMinute } as any);
        expect(rebooked.status).toBe('CONFIRMED');
      });
    });

    describe('edición y reprogramación', () => {
      it('reserva independiente: editar y reprogramar conserva estado, versión y precio pactado', async () => {
        const booked = await book(svcPlain);
        const r0 = await row(booked.id);
        await prisma.item.update({ where: { id: svcPlain }, data: { price: 55555 } });
        try {
          await sales.update(bizV2, booked.id, { customerName: 'Nuevo nombre', paymentMethod: 'BANK_TRANSFER' } as any, 'RESERVATION');
          const target = nextFuture();
          await reservations.reschedule(bizV2, booked.id, { date: target, startMinute: H(15), endMinute: H(16) });
          const r = await row(booked.id);
          expect(r).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2, paymentMethod: 'BANK_TRANSFER', customerName: 'Nuevo nombre', startMinute: H(15) });
          expect(r.confirmedAt).toEqual(r0.confirmedAt);
          expect(Number(r.priceSnapshot)).toBe(20000);
        } finally {
          await prisma.item.update({ where: { id: svcPlain }, data: { price: 20000 } });
        }
      });
      it('espejo: misma franja y reprogramación conservan CONFIRMED, versión, confirmedAt e id', async () => {
        const order = await mirror(svcPlain);
        const m0 = await row(order.id);
        await sales.update(bizV2, order.id, { customerName: 'Otro cliente', scheduledAt: `${m0.date.toISOString().slice(0, 10)}T10:00:00` } as any);
        expect(await row(order.id)).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2, confirmedAt: m0.confirmedAt, customerName: 'Otro cliente' });
        await sales.update(bizV2, order.id, { scheduledAt: `${nextFuture()}T12:00:00` } as any);
        const m1 = await row(order.id);
        expect(m1).toMatchObject({ id: order.id, status: 'CONFIRMED', commercialPolicyVersion: 2, confirmedAt: m0.confirmedAt, startMinute: H(12) });
        expect(await effects(order.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
      it('espejo: sólo se reactiva tras el desprendimiento controlado por edición', async () => {
        const order = await mirror(svcPlain);
        const detachedAt = nextFuture();
        // Two lines: no longer a lone scheduled service, so the editor detaches the mirror.
        await sales.update(bizV2, order.id, { items: [{ itemId: svcPlain, quantity: 1 }, { itemId: svcFree, quantity: 1 }] } as any);
        expect(await row(order.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'MIRROR_DETACHED_BY_EDIT' });
        await sales.update(bizV2, order.id, { items: [{ itemId: svcPlain, quantity: 1 }], scheduledAt: `${detachedAt}T09:00:00` } as any);
        const revived = await row(order.id);
        expect(revived).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2, cancelReason: null, cancelledAt: null, startMinute: H(9) });

        // An ordinary cancellation (or no-show) is never revived by editing.
        await prisma.reservation.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelReason: 'Pedido del cliente', cancelledAt: new Date() } });
        await expect(sales.update(bizV2, order.id, { scheduledAt: `${nextFuture()}T09:00:00` } as any)).rejects.toMatchObject(code('MIRROR_REACTIVATION_NOT_ALLOWED'));
        await prisma.reservation.update({ where: { id: order.id }, data: { cancelReason: 'NO_SHOW' } });
        await expect(sales.update(bizV2, order.id, { scheduledAt: `${nextFuture()}T09:00:00` } as any)).rejects.toMatchObject(code('MIRROR_REACTIVATION_NOT_ALLOWED'));
        expect(await row(order.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'NO_SHOW' });
      });
      it('reprogramar contra finalizar no deja efectos con horario movido', async () => {
        const booked = await book(svcRecipe);
        await started(booked.id);
        const r0 = await row(booked.id);
        const results = await Promise.allSettled([sales.completeReservation(bizV2, booked.id, true), reservations.reschedule(bizV2, booked.id, { date: nextFuture(), startMinute: H(10), endMinute: H(11) })]);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
        const r = await row(booked.id);
        if (r.status === 'COMPLETED') expect(r.date).toEqual(r0.date);
        else expect(await effects(booked.id)).toEqual({ inventory: [], accounting: [], fiscal: [] });
      });
    });

    describe('idempotencia pública', () => {
      it('mismo intento: misma reserva, una sola fila, clave hasheada y nunca expuesta', async () => {
        const request = dto(svcPlain);
        const first: any = await publicStore.createReservation(slugV2, request);
        const second: any = await publicStore.createReservation(slugV2, { ...request });
        expect(second).toEqual(first);
        expect(Object.keys(first).sort()).toEqual(['createdAt', 'date', 'endMinute', 'id', 'publicToken', 'startMinute', 'status']);
        const stored = await row(first.id);
        expect(stored.publicRequestId).not.toBe(request.idempotencyKey);
        expect(stored.publicRequestId).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(first)).not.toContain(request.idempotencyKey);
        expect(await prisma.reservation.count({ where: { businessId: bizV2, publicRequestId: stored.publicRequestId } })).toBe(1);
      });
      it('reintentos concurrentes crean una sola reserva', async () => {
        const request = dto(svcPlain);
        const results = await Promise.allSettled([1, 2, 3].map(() => publicStore.createReservation(slugV2, { ...request })));
        const ok = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
        expect(ok).toHaveLength(3);
        expect(new Set(ok.map(r => r.value.id)).size).toBe(1);
        expect(await prisma.reservation.count({ where: { businessId: bizV2, customerName: request.customerName, date: asDate(request.date) } })).toBe(1);
      });
      it('misma clave con otro contenido: 409 sin datos', async () => {
        const request = dto(svcPlain);
        await publicStore.createReservation(slugV2, request);
        const error: any = await publicStore.createReservation(slugV2, { ...request, customerName: 'Otra persona' }).catch(e => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' }));
        expect(JSON.stringify(error.getResponse())).not.toMatch(/publicToken|"id"/);
      });
      it('reserva cancelada: el reintento devuelve el estado actual sin crear otra', async () => {
        const request = dto(svcPlain);
        const first: any = await publicStore.createReservation(slugV2, request);
        await publicStore.cancelReservation(first.id, first.publicToken);
        const replay: any = await publicStore.createReservation(slugV2, { ...request });
        expect(replay).toMatchObject({ id: first.id, status: 'CANCELLED' });
        expect(await prisma.reservation.count({ where: { businessId: bizV2, customerName: request.customerName, date: asDate(request.date) } })).toBe(1);
      });
      it('pasada la ventana la clave no recupera el token ni crea una reserva', async () => {
        const request = dto(svcPlain);
        const first: any = await publicStore.createReservation(slugV2, request);
        await prisma.reservation.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
        const error: any = await publicStore.createReservation(slugV2, { ...request }).catch(e => e);
        expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_EXPIRED' }));
        expect(JSON.stringify(error.getResponse())).not.toContain(first.publicToken);
        expect(await prisma.reservation.count({ where: { businessId: bizV2, customerName: request.customerName, date: asDate(request.date) } })).toBe(1);
      });
      it('una clave de otro negocio nunca devuelve datos ajenos', async () => {
        const request = dto(svcPlain);
        const mine: any = await publicStore.createReservation(slugV2, request);
        const other: any = await publicStore.createReservation(slug, { ...request, itemId: service90, startMinute: H(12) });
        expect(other.id).not.toBe(mine.id);
        expect(other.publicToken).not.toBe(mine.publicToken);
        expect((await row(other.id)).businessId).toBe(businessId);
      });
    });

    it('el flag obsoleto no cambia nada: con flag apagado o encendido toda reserva nueva es v2', async () => {
      for (const enabled of [false, true]) {
        await prisma.business.update({ where: { id: bizV2 }, data: { reservationPolicyV2Enabled: enabled } });
        const created: any = await reservations.create(bizV2, { itemId: svcPlain, date: nextFuture(), startMinute: H(13) } as any);
        expect(created).toMatchObject({ status: 'CONFIRMED', commercialPolicyVersion: 2 });
        expect(String(created.priceSnapshot)).toBe('20000');
        expect(await effects(created.id)).toEqual({ accounting: [], inventory: [], fiscal: [] });
      }
      await prisma.business.update({ where: { id: bizV2 }, data: { reservationPolicyV2Enabled: false } });
    });
  });

});
