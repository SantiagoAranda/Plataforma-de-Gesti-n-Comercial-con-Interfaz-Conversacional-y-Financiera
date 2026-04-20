import { BadRequestException } from '@nestjs/common';
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
        update: mockFn(),
      },
      inventoryMovement: {
        create: mockFn(),
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
});
