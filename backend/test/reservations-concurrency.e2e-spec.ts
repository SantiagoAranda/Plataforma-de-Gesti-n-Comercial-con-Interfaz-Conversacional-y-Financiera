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
        status: 'PENDING',
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
          [rebooked.id, 'PENDING'],
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
      ).toBe('PENDING');

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
          status: 'PENDIENTE',
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
          status: 'PENDING',
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
      ).toBe('PENDING');

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
        ).toBe('PENDING');
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
});
