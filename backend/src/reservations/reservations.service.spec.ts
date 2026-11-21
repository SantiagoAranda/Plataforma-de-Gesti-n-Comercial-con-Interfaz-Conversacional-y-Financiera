import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ReservationsService } from './reservations.service';
import {
  BUSINESS_ID,
  createFakePrisma,
  freezeBogotaTime,
  ITEM_ID,
} from '../availability/availability.test-utils';

describe('ReservationsService', () => {
  beforeEach(() => freezeBogotaTime('2026-08-20T08:00:00'));
  afterEach(() => jest.useRealTimers());

  it('rejects availability and new reservations for an inactive service', async () => {
    const prisma = {
      item: {
        findFirst: jest
          .fn<any>()
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
    const prisma = createFakePrisma({
      durationMinutes: 60,
      itemStatus: 'INACTIVE',
      windows: [],
    });
    const service = new ReservationsService(prisma);

    await expect(
      service.create(BUSINESS_ID, {
        itemId: ITEM_ID,
        date: '2026-08-27',
        startMinute: 600,
        endMinute: 660,
      }),
    ).rejects.toThrow(/servicio no est/);
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('reschedules an existing reservation of an inactive service using its persisted itemId', async () => {
    const prisma = createFakePrisma({
      durationMinutes: 60,
      itemStatus: 'INACTIVE',
      // 2026-08-28 is a Friday.
      windows: [
        { itemId: ITEM_ID, weekday: 'FRI', startMinute: 540, endMinute: 780 },
      ],
      reservations: [
        {
          id: 'reservation-1',
          date: '2026-08-27',
          startMinute: 600,
          endMinute: 660,
          status: 'PENDING',
        },
      ],
    });
    const service = new ReservationsService(prisma);

    await service.reschedule(BUSINESS_ID, 'reservation-1', {
      date: '2026-08-28',
      startMinute: 600,
      endMinute: 660,
    });

    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ITEM_ID, businessId: BUSINESS_ID },
      }),
    );
    expect(prisma.reservations[0]).toEqual(
      expect.objectContaining({ itemId: ITEM_ID, startMinute: 600 }),
    );
  });
});
