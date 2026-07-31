import { FiscalCalculationStatus } from '@prisma/client';
import { FiscalLifecycleService } from './fiscal-lifecycle.service';

describe('FiscalLifecycleService', () => {
  it('marks only non-locked order contexts stale with a stable reason', async () => {
    const prisma = {
      saleFiscalContext: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;
    const service = new FiscalLifecycleService(prisma);
    await service.invalidateOrder('order-1', 'QUANTITY_CHANGED');
    expect(prisma.saleFiscalContext.updateMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        calculationStatus: { not: FiscalCalculationStatus.LOCKED },
      },
      data: expect.objectContaining({
        calculationStatus: FiscalCalculationStatus.STALE,
        invalidationReason: 'QUANTITY_CHANGED',
      }),
    });
  });

  it('never targets locked contexts during business invalidation', async () => {
    const prisma = {
      saleFiscalContext: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    } as any;
    const service = new FiscalLifecycleService(prisma);
    await service.invalidateBusiness('business-1');
    expect(
      prisma.saleFiscalContext.updateMany.mock.calls[0][0].where
        .calculationStatus,
    ).toEqual({ not: FiscalCalculationStatus.LOCKED });
  });
});
