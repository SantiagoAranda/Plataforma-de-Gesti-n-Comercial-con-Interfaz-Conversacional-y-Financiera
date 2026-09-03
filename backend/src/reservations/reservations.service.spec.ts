import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

describe('ReservationsService', () => {
  it('rejects availability and new reservations for an inactive service', async () => {
    const prisma = {
      item: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'service-1' }),
      },
    };
    const service = new ReservationsService(prisma as any);

    await expect(
      service.getAvailability('business-1', 'service-1', '2026-08-27'),
    ).rejects.toThrow(/servicio no est/);
  });

  it('rejects a new reservation for an inactive service', async () => {
    const prisma = {
      item: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'service-1' }),
      },
      reservation: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new ReservationsService(prisma as any);

    await expect(
      service.create('business-1', {
        itemId: 'service-1',
        date: '2026-08-27',
        startMinute: 600,
        endMinute: 660,
      }),
    ).rejects.toThrow(/servicio no est/);
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('reschedules an existing reservation using its persisted itemId without resolving a new service', async () => {
    const prisma = {
      reservation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'reservation-1',
            itemId: 'inactive-service-1',
            status: 'PENDING',
          })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
      },
      item: { findFirst: jest.fn() },
    };
    const service = new ReservationsService(prisma as any);

    await service.reschedule('business-1', 'reservation-1', {
      date: '2026-08-28',
      startMinute: 600,
      endMinute: 660,
    });

    expect(prisma.reservation.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ itemId: 'inactive-service-1' }),
      }),
    );
    expect(prisma.item.findFirst).not.toHaveBeenCalled();
  });
});
