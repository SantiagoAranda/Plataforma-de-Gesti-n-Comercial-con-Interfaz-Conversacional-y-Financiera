import { describe, expect, it, jest } from '@jest/globals';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BUSINESS_ID, createFakePrisma } from './availability.test-utils';
import { ReservationsService } from '../reservations/reservations.service';
import { PublicService, publicTokenMatches } from '../public/public.service';
import { SalesService } from '../sales/sales.service';
import { RESERVATION_ERRORS } from './availability.service';

const TOKEN = '6f1c2a3b-0000-4000-8000-000000000001';

function setup(status: string, opts: { mirror?: boolean } = {}) {
  const prisma = createFakePrisma({
    durationMinutes: 60,
    windows: [],
    reservations: [
      {
        id: 'res-1',
        date: '2026-12-01',
        startMinute: 600,
        endMinute: 660,
        status,
      },
    ],
  });
  (prisma as any).accountingMovement = { findMany: jest.fn<any>().mockResolvedValue([]) };
  (prisma as any).inventoryMovement = { findMany: jest.fn<any>().mockResolvedValue([]) };
  prisma.reservations[0].publicToken = TOKEN;
  prisma.reservations[0].inventoryPostedAt =
    status === 'CONFIRMED' ? new Date() : null;
  if (opts.mirror)
    prisma.order.findFirst = jest.fn<any>().mockResolvedValue({ id: 'res-1' });
  const inventory = {
    reverseInventoryConsumptionForReservation: jest
      .fn<any>()
      .mockResolvedValue([]),
  };
  const accounting = {
    reverseOrderMovements: jest.fn<any>().mockResolvedValue([]),
  };
  return {
    prisma,
    inventory,
    accounting,
    reservations: new ReservationsService(prisma),
    publicStore: new PublicService(prisma, {} as any, {} as any, {} as any),
    sales: new SalesService(
      prisma,
      accounting as any,
      inventory as any,
      {} as any,
      {} as any,
    ),
    row: () => prisma.reservations[0],
  };
}

describe('Cancelación de reservas: reglas de transición', () => {
  it('PENDING → CANCELLED en las tres rutas, tomando el lock de fila antes de escribir', async () => {
    for (const run of [
      (s: ReturnType<typeof setup>) =>
        s.reservations.cancel(BUSINESS_ID, 'res-1'),
      (s: ReturnType<typeof setup>) =>
        s.publicStore.cancelReservation('res-1', TOKEN),
      (s: ReturnType<typeof setup>) =>
        s.sales.cancel(BUSINESS_ID, 'res-1', 'RESERVATION'),
    ]) {
      const s = setup('PENDING');
      await run(s);
      expect(s.row().status).toBe('CANCELLED');
      expect(s.prisma.$queryRaw).toHaveBeenCalled();
      expect(s.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        s.prisma.reservation.update.mock.invocationCallOrder[0],
      );
      // PENDING never consumed anything: nothing to reverse.
      expect(
        s.inventory.reverseInventoryConsumptionForReservation,
      ).not.toHaveBeenCalled();
      expect(s.accounting.reverseOrderMovements).not.toHaveBeenCalled();
    }
  });

  it('CANCELLED → CANCELLED es idempotente y no produce efectos', async () => {
    const s = setup('CANCELLED');
    await expect(
      s.reservations.cancel(BUSINESS_ID, 'res-1'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(
      s.publicStore.cancelReservation('res-1', TOKEN),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(
      s.sales.cancel(BUSINESS_ID, 'res-1', 'RESERVATION'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(s.prisma.reservation.update).not.toHaveBeenCalled();
    expect(
      s.inventory.reverseInventoryConsumptionForReservation,
    ).not.toHaveBeenCalled();
    expect(s.accounting.reverseOrderMovements).not.toHaveBeenCalled();
  });

  it('CONFIRMED: Ventas revierte inventario y contabilidad; Reservas y Tienda responden 409', async () => {
    const s = setup('CONFIRMED');
    await expect(s.reservations.cancel(BUSINESS_ID, 'res-1')).rejects.toThrow(
      new ConflictException(RESERVATION_ERRORS.confirmedCancelRequiresSales),
    );
    await expect(
      s.publicStore.cancelReservation('res-1', TOKEN),
    ).rejects.toThrow(
      new ConflictException(RESERVATION_ERRORS.publicCancelNotAllowed),
    );
    expect(s.row().status).toBe('CONFIRMED');

    await s.sales.cancel(BUSINESS_ID, 'res-1', 'RESERVATION');
    expect(s.row().status).toBe('CANCELLED');
    expect(
      s.inventory.reverseInventoryConsumptionForReservation,
    ).toHaveBeenCalledWith(s.prisma, BUSINESS_ID, 'res-1');
    expect(s.accounting.reverseOrderMovements).toHaveBeenCalledWith(
      s.prisma,
      BUSINESS_ID,
      expect.objectContaining({ orderId: 'res-1', accountingPostedAt: null }),
    );
  });

  it('un espejo de venta (Reservation.id = Order.id) no se cancela como reserva', async () => {
    const s = setup('PENDING', { mirror: true });
    for (const run of [
      () => s.reservations.cancel(BUSINESS_ID, 'res-1'),
      () => s.publicStore.cancelReservation('res-1', TOKEN),
      () => s.sales.cancel(BUSINESS_ID, 'res-1', 'RESERVATION'),
    ]) {
      await expect(run()).rejects.toThrow(
        new ConflictException(RESERVATION_ERRORS.linkedToSale),
      );
    }
    expect(s.row().status).toBe('PENDING');
  });

  it('Tienda: sin token, token ajeno o reserva sin token → 403; inexistente → null (404)', async () => {
    const s = setup('PENDING');
    await expect(
      s.publicStore.cancelReservation('res-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      s.publicStore.cancelReservation('res-1', 'otro'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    s.row().publicToken = null;
    await expect(
      s.publicStore.cancelReservation('res-1', TOKEN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.row().status).toBe('PENDING');
    await expect(
      s.publicStore.cancelReservation('nope', TOKEN),
    ).resolves.toBeNull();
  });

  it('reserva inexistente en Reservas → 404', async () => {
    const s = setup('PENDING');
    await expect(
      s.reservations.cancel(BUSINESS_ID, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Ventas: eliminar una PENDING la cancela (libera el horario); una CONFIRMED se rechaza', async () => {
    const pending = setup('PENDING');
    await pending.sales.remove(BUSINESS_ID, 'res-1', 'RESERVATION');
    expect(pending.row()).toMatchObject({
      archived: true,
      status: 'CANCELLED',
    });

    const confirmed = setup('CONFIRMED');
    await expect(
      confirmed.sales.remove(BUSINESS_ID, 'res-1', 'RESERVATION'),
    ).rejects.toMatchObject({ status: 400 });
    expect(confirmed.row().status).toBe('CONFIRMED');
  });

  it('publicTokenMatches compara en tiempo constante y nunca acepta vacíos', () => {
    expect(publicTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(publicTokenMatches(TOKEN, TOKEN.slice(0, -1))).toBe(false);
    expect(publicTokenMatches(null, TOKEN)).toBe(false);
    expect(publicTokenMatches(TOKEN, '')).toBe(false);
  });
});
