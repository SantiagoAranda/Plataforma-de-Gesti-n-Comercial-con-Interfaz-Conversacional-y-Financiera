import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const businessId = 'business-1';
  const ingredientId = 'ingredient-1';
  const mockFn = () => jest.fn() as any;

  function createService(overrides: Record<string, any> = {}) {
    const tx = {
      ingredient: {
        findFirst: mockFn(),
        findMany: mockFn(),
        update: mockFn(),
      },
      inventoryMovement: {
        findMany: mockFn(),
        create: mockFn(),
      },
      recipe: {
        findMany: mockFn(),
      },
      order: {
        update: mockFn(),
      },
      ...overrides,
    };

    const prisma = {
      $transaction: jest.fn((fn: (transaction: any) => unknown) => fn(tx)),
      ...tx,
    } as any;

    return { service: new InventoryService(prisma), tx, prisma };
  }

  it('recalculates weighted average cost on purchase', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(2),
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-1', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.applyInventoryMovement(tx as any, businessId, {
      ingredientId,
      type: 'PURCHASE',
      quantity: 10,
      unitCost: 4,
      referenceType: 'PURCHASE_MANUAL',
    });

    expect(movement.stockAfter.toString()).toBe('20');
    expect(movement.averageCostAfter.toString()).toBe('3');
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: {
        currentStock: new Prisma.Decimal(20),
        averageCost: new Prisma.Decimal(3),
      },
    });
  });

  it('blocks negative adjustment when stock is insufficient', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(2),
      averageCost: new Prisma.Decimal(3),
    });

    await expect(
      service.applyInventoryMovement(tx as any, businessId, {
        ingredientId,
        type: 'ADJUSTMENT_NEGATIVE',
        quantity: 3,
        referenceType: 'MANUAL',
        detail: 'waste',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('consumes stock and creates SALE movement for SIMPLE item sales', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId,
        quantityRequired: new Prisma.Decimal(2),
        isOptional: false,
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      {
        id: ingredientId,
        name: 'Flour',
        currentStock: new Prisma.Decimal(10),
      },
    ]);
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(3),
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'sale-movement-1', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});
    tx.order.update.mockResolvedValue({});

    const movements = await service.applyInventoryConsumptionForOrder(
      tx as any,
      businessId,
      {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 1,
            itemNameSnapshot: 'Bread',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'SIMPLE',
          },
        ],
      },
    );

    expect(movements).toHaveLength(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId,
        ingredientId,
        type: 'SALE',
        referenceType: 'ORDER_ITEM',
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        quantity: new Prisma.Decimal(2),
        unitCost: new Prisma.Decimal(3),
        totalValue: new Prisma.Decimal(6),
        stockAfter: new Prisma.Decimal(8),
        averageCostAfter: new Prisma.Decimal(3),
      }),
    });
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: {
        currentStock: new Prisma.Decimal(8),
        averageCost: new Prisma.Decimal(3),
      },
    });
  });

  it('consumes multiple ingredients for RECIPE_BASED item sales', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-1',
        quantityRequired: new Prisma.Decimal(2),
        isOptional: false,
      },
      {
        ingredientId: 'ingredient-2',
        quantityRequired: new Prisma.Decimal(5),
        isOptional: false,
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      { id: 'ingredient-1', name: 'Flour', currentStock: new Prisma.Decimal(10) },
      { id: 'ingredient-2', name: 'Water', currentStock: new Prisma.Decimal(20) },
    ]);
    tx.ingredient.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        businessId,
        name: where.id === 'ingredient-1' ? 'Flour' : 'Water',
        currentStock: where.id === 'ingredient-1' ? new Prisma.Decimal(10) : new Prisma.Decimal(20),
        averageCost: where.id === 'ingredient-1' ? new Prisma.Decimal(3) : new Prisma.Decimal(1),
      }),
    );
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: `movement-${data.ingredientId}`, ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});
    tx.order.update.mockResolvedValue({});

    const movements = await service.applyInventoryConsumptionForOrder(
      tx as any,
      businessId,
      {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 2,
            itemNameSnapshot: 'Cake',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
          },
        ],
      },
    );

    expect(movements).toHaveLength(2);
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-1' },
      data: {
        currentStock: new Prisma.Decimal(6),
        averageCost: new Prisma.Decimal(3),
      },
    });
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ingredient-2' },
      data: {
        currentStock: new Prisma.Decimal(10),
        averageCost: new Prisma.Decimal(1),
      },
    });
  });

  it('does not affect stock for SERVICE item sales', async () => {
    const { service, tx } = createService();
    tx.order.update.mockResolvedValue({});

    const movements = await service.applyInventoryConsumptionForOrder(
      tx as any,
      businessId,
      {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 1,
            itemNameSnapshot: 'Haircut',
            itemTypeSnapshot: 'SERVICE',
            inventoryModeSnapshot: 'NONE',
          },
        ],
      },
    );

    expect(movements).toEqual([]);
    expect(tx.recipe.findMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { inventoryPostedAt: expect.any(Date) },
    });
  });

  it('blocks order inventory consumption when stock is insufficient', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId,
        quantityRequired: new Prisma.Decimal(5),
        isOptional: false,
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      {
        id: ingredientId,
        name: 'Flour',
        currentStock: new Prisma.Decimal(2),
      },
    ]);

    await expect(
      service.applyInventoryConsumptionForOrder(tx as any, businessId, {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 1,
            itemNameSnapshot: 'Bread',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'SIMPLE',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('skips order inventory consumption when inventoryPostedAt is already set', async () => {
    const { service, tx } = createService();

    const movements = await service.applyInventoryConsumptionForOrder(
      tx as any,
      businessId,
      {
        id: 'order-1',
        inventoryPostedAt: new Date(),
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 1,
            itemNameSnapshot: 'Bread',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'SIMPLE',
          },
        ],
      },
    );

    expect(movements).toEqual([]);
    expect(tx.recipe.findMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('lists SALE movements in Kardex', async () => {
    const { service, tx, prisma } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(8),
      averageCost: new Prisma.Decimal(3),
    });
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'sale-movement-1',
        ingredientId,
        type: 'SALE',
      },
    ]);

    const kardex = await service.listKardex(businessId, ingredientId, {});

    expect(kardex).toEqual([
      {
        id: 'sale-movement-1',
        ingredientId,
        type: 'SALE',
      },
    ]);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId, ingredientId },
      }),
    );
  });

  it('creates SALE_RETURN movements and restores stock on order reversal without changing average cost', async () => {
    const { service, tx } = createService();

    tx.inventoryMovement.findMany
      .mockResolvedValueOnce([
        {
          id: 'sale-1',
          businessId,
          ingredientId,
          orderId: 'order-1',
          orderItemId: 'order-item-1',
          type: 'SALE',
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(3),
          totalValue: new Prisma.Decimal(6),
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          id: 'sale-2',
          businessId,
          ingredientId,
          orderId: 'order-1',
          orderItemId: 'order-item-2',
          type: 'SALE',
          quantity: new Prisma.Decimal(1),
          unitCost: new Prisma.Decimal(3),
          totalValue: new Prisma.Decimal(3),
          createdAt: new Date('2026-04-01T00:00:01.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);

    tx.ingredient.findMany.mockResolvedValue([
      {
        id: ingredientId,
        name: 'Flour',
        currentStock: new Prisma.Decimal(5),
        averageCost: new Prisma.Decimal(4),
      },
    ]);

    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: `return-${data.orderItemId}`, ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const returns = await service.reverseInventoryConsumptionForOrder(
      tx as any,
      businessId,
      { orderId: 'order-1', reason: 'Cliente canceló' },
    );

    expect(returns).toHaveLength(2);

    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: 'SALE_RETURN',
        ingredientId,
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        quantity: new Prisma.Decimal(2),
        unitCost: new Prisma.Decimal(3),
        totalValue: new Prisma.Decimal(6),
        stockAfter: new Prisma.Decimal(7),
        averageCostAfter: new Prisma.Decimal(4),
        detail: 'Cliente canceló',
      }),
    });

    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        orderItemId: 'order-item-2',
        stockAfter: new Prisma.Decimal(8),
        averageCostAfter: new Prisma.Decimal(4),
      }),
    });

    expect(tx.ingredient.update).toHaveBeenNthCalledWith(1, {
      where: { id: ingredientId },
      data: { currentStock: new Prisma.Decimal(7) },
    });

    expect(tx.ingredient.update).toHaveBeenNthCalledWith(2, {
      where: { id: ingredientId },
      data: { currentStock: new Prisma.Decimal(8) },
    });
  });

  it('throws ConflictException when order inventory is already reversed', async () => {
    const { service, tx } = createService();

    tx.inventoryMovement.findMany
      .mockResolvedValueOnce([
        {
          id: 'sale-1',
          businessId,
          ingredientId,
          orderId: 'order-1',
          orderItemId: 'order-item-1',
          type: 'SALE',
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(3),
          totalValue: new Prisma.Decimal(6),
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          ingredientId,
          orderItemId: 'order-item-1',
        },
      ]);

    await expect(
      service.reverseInventoryConsumptionForOrder(tx as any, businessId, {
        orderId: 'order-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException when an ingredient referenced by SALE movement does not exist', async () => {
    const { service, tx } = createService();

    tx.inventoryMovement.findMany
      .mockResolvedValueOnce([
        {
          id: 'sale-1',
          businessId,
          ingredientId: 'missing-ingredient',
          orderId: 'order-1',
          orderItemId: 'order-item-1',
          type: 'SALE',
          quantity: new Prisma.Decimal(2),
          unitCost: new Prisma.Decimal(3),
          totalValue: new Prisma.Decimal(6),
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    tx.ingredient.findMany.mockResolvedValue([]);

    await expect(
      service.reverseInventoryConsumptionForOrder(tx as any, businessId, {
        orderId: 'order-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
