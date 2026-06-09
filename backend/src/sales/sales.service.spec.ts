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

describe('SalesService.updateOrderItemOptionalIngredients', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';
  const orderItemId = 'order-item-1';
  const requiredIngredientId = 'ingredient-required';
  const optionalIngredientId = 'ingredient-optional';
  const outsideIngredientId = 'ingredient-outside';
  const mockFn = () => jest.fn() as any;

  function createRecipeOrder(overrides: Record<string, any> = {}) {
    return {
      id: orderId,
      businessId,
      status: 'SENT',
      inventoryPostedAt: null,
      items: [
        {
          id: orderItemId,
          orderId,
          businessId,
          itemId: 'item-1',
          inventoryModeSnapshot: 'RECIPE_BASED',
          excludedOptionalIngredientIds: null,
          item: {
            id: 'item-1',
            inventoryMode: 'RECIPE_BASED',
            recipes: [
              {
                ingredientId: requiredIngredientId,
                isOptional: false,
                quantityRequired: 1,
                ingredient: {
                  id: requiredIngredientId,
                  name: 'Pan',
                  consumptionUnit: 'UNIT',
                  customUnitLabel: null,
                },
              },
              {
                ingredientId: optionalIngredientId,
                isOptional: true,
                quantityRequired: 1,
                ingredient: {
                  id: optionalIngredientId,
                  name: 'Mayonesa',
                  consumptionUnit: 'GRAM',
                  customUnitLabel: null,
                },
              },
            ],
          },
        },
      ],
      ...overrides,
    };
  }

  function createService(order: Record<string, any> | null = createRecipeOrder()) {
    const prisma = {
      order: {
        findFirst: mockFn().mockResolvedValue(order),
      },
      orderItem: {
        update: mockFn().mockResolvedValue({
          ...createRecipeOrder().items[0],
          excludedOptionalIngredientIds: [optionalIngredientId],
        }),
      },
    } as any;

    const accountingService = {} as any;
    const inventoryService = {} as any;

    return { service: new SalesService(prisma, accountingService, inventoryService), prisma };
  }

  it('persists optional ingredient exclusions before inventory is posted', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateOrderItemOptionalIngredients(businessId, orderId, orderItemId, {
        excludedOptionalIngredientIds: [optionalIngredientId],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: orderItemId,
        excludedOptionalIngredientIds: [optionalIngredientId],
      }),
    );

    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderItemId },
        data: { excludedOptionalIngredientIds: [optionalIngredientId] },
      }),
    );
  });

  it('rejects excluding mandatory ingredients', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateOrderItemOptionalIngredients(businessId, orderId, orderItemId, {
        excludedOptionalIngredientIds: [requiredIngredientId],
      }),
    ).rejects.toThrow('Mandatory ingredients cannot be excluded');

    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('rejects ingredients outside the optional recipe', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateOrderItemOptionalIngredients(businessId, orderId, orderItemId, {
        excludedOptionalIngredientIds: [outsideIngredientId],
      }),
    ).rejects.toThrow('outside the optional recipe');

    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate exclusions', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateOrderItemOptionalIngredients(businessId, orderId, orderItemId, {
        excludedOptionalIngredientIds: [optionalIngredientId, optionalIngredientId],
      }),
    ).rejects.toThrow('contains duplicates');

    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('rejects updates after inventory was posted', async () => {
    const { service, prisma } = createService(
      createRecipeOrder({ inventoryPostedAt: new Date() }),
    );

    await expect(
      service.updateOrderItemOptionalIngredients(businessId, orderId, orderItemId, {
        excludedOptionalIngredientIds: [optionalIngredientId],
      }),
    ).rejects.toThrow('Order inventory has already been posted');

    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });
});

describe('SalesService.confirmOrder optional ingredient exclusions', () => {
  const businessId = 'business-1';
  const orderId = 'order-1';

  it('passes the persisted exclusions to InventoryService when confirming', async () => {
    const order = {
      id: orderId,
      businessId,
      status: 'SENT',
      accountingPostedAt: new Date(),
      inventoryPostedAt: null,
      items: [
        {
          id: 'order-item-1',
          excludedOptionalIngredientIds: ['ingredient-optional'],
          item: { id: 'item-1' },
        },
      ],
    };

    const tx = {
      order: {
        findFirst: (jest.fn() as any).mockResolvedValue(order),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: (jest.fn() as any).mockResolvedValue({
          ...order,
          status: 'COMPLETED',
          inventoryPostedAt: new Date(),
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (innerTx: any) => unknown) => fn(tx)),
    } as any;
    const inventoryService = {
      applyInventoryConsumptionForOrder: (jest.fn() as any).mockResolvedValue([]),
    } as any;
    const accountingService = {
      postOrderMovements: jest.fn(),
    } as any;
    const service = new SalesService(prisma, accountingService, inventoryService);

    await service.confirmOrder(businessId, orderId, 'ORDER');

    expect(inventoryService.applyInventoryConsumptionForOrder).toHaveBeenCalledWith(
      tx,
      businessId,
      expect.objectContaining({
        items: [
          expect.objectContaining({
            excludedOptionalIngredientIds: ['ingredient-optional'],
          }),
        ],
      }),
      expect.any(Date),
    );
    expect(accountingService.postOrderMovements).not.toHaveBeenCalled();
  });
});
