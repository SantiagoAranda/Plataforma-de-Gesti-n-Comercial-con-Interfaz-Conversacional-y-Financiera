import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { SalesService } from './sales.service';

describe('SalesService.remove', () => {
  const businessId = 'business-1';
  const mockFn = () => jest.fn() as any;

  function createService(order: Record<string, any> | null) {
    const inventoryService = {
      reverseInventoryConsumptionForOrder: jest.fn(),
      applyInventoryConsumptionForOrder: jest.fn(),
    } as any;

    const prisma = {
      reservation: {
        findFirst: mockFn(),
        update: mockFn(),
      },
      order: {
        findFirst: mockFn().mockResolvedValue(order),
        update: mockFn().mockResolvedValue({ id: 'order-1', archived: true }),
      },
      orderItem: {
        findMany: mockFn(),
      },
      item: {
        findMany: mockFn(),
      },
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
    } as any;

    const accountingService = {} as any;

    return { service: new SalesService(prisma, accountingService, inventoryService), prisma, inventoryService };
  }

  it('archives non-completed orders', async () => {
    const { service, prisma, inventoryService } = createService({
      id: 'order-1',
      businessId,
      status: 'SENT',
      inventoryPostedAt: null,
    });

    await expect(service.remove(businessId, 'order-1', 'ORDER')).resolves.toEqual(
      expect.objectContaining({ archived: true }),
    );
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
    expect(inventoryService.reverseInventoryConsumptionForOrder).not.toHaveBeenCalled();
    expect(inventoryService.applyInventoryConsumptionForOrder).not.toHaveBeenCalled();
  });

  it('archives COMPLETED orders when inventoryPostedAt is null', async () => {
    const { service, prisma, inventoryService } = createService({
      id: 'order-1',
      businessId,
      status: 'COMPLETED',
      inventoryPostedAt: null,
    });

    await expect(service.remove(businessId, 'order-1', 'ORDER')).resolves.toEqual(
      expect.objectContaining({ archived: true }),
    );
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
    expect(inventoryService.reverseInventoryConsumptionForOrder).not.toHaveBeenCalled();
    expect(inventoryService.applyInventoryConsumptionForOrder).not.toHaveBeenCalled();
  });

  it('blocks deletion for COMPLETED orders with inventoryPostedAt set', async () => {
    const { service, prisma, inventoryService } = createService({
      id: 'order-1',
      businessId,
      status: 'COMPLETED',
      inventoryPostedAt: new Date(),
    });

    await expect(service.remove(businessId, 'order-1', 'ORDER')).rejects.toThrow(
      'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.',
    );
    await expect(service.remove(businessId, 'order-1', 'ORDER')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(inventoryService.reverseInventoryConsumptionForOrder).not.toHaveBeenCalled();
    expect(inventoryService.applyInventoryConsumptionForOrder).not.toHaveBeenCalled();
  });
});

describe('SalesService.reverseConfirmedOrder', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';
  const mockFn = () => jest.fn() as any;

  it('reverses inventory via InventoryService and cancels the order (happy path)', async () => {
    const inventoryService = {
      reverseInventoryConsumptionForOrder: (jest.fn() as any).mockResolvedValue([
        { id: 'return-1' },
      ] as any),
    } as any;

    const tx = {
      order: {
        findFirst: mockFn().mockResolvedValue({
          id: orderId,
          businessId,
          status: 'COMPLETED',
          inventoryPostedAt: new Date(),
          items: [],
        }),
        update: mockFn().mockResolvedValue({
          id: orderId,
          businessId,
          status: 'CANCELLED',
          inventoryPostedAt: new Date(),
          items: [],
        }),
      },
      inventoryMovement: {
        findMany: mockFn().mockResolvedValue([]),
      },
    };

    const prisma = {
      $transaction: jest.fn((fn: (innerTx: any) => unknown) => fn(tx)),
    } as any;

    const accountingService = {} as any;
    const service = new SalesService(prisma, accountingService, inventoryService);

    const result = await service.reverseConfirmedOrder(businessId, orderId, {
      reason: 'Cliente canceló',
    } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: { id: orderId, businessId },
      include: { items: { include: { item: true } } },
    });
    expect(tx.inventoryMovement.findMany).toHaveBeenCalledWith({
      where: { businessId, orderId, type: 'SALE_RETURN' },
      take: 1,
      select: { id: true },
    });
    expect(inventoryService.reverseInventoryConsumptionForOrder).toHaveBeenCalledWith(
      tx,
      businessId,
      { orderId, reason: 'Cliente canceló' },
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
      include: { items: { include: { item: true } } },
    });
    expect(result).toEqual(
      expect.objectContaining({
        inventoryReversed: true,
        reversalMovements: [{ id: 'return-1' }],
      }),
    );
  });
});
