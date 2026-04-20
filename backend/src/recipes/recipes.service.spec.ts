import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  const businessId = 'business-1';
  const itemId = 'item-1';
  const ingredientId = 'ingredient-1';
  const mockFn = () => jest.fn() as any;

  function createService(item: Record<string, any>) {
    const tx = {
      recipe: {
        deleteMany: mockFn().mockResolvedValue({ count: 1 }),
        createMany: mockFn().mockResolvedValue({ count: 1 }),
        findMany: mockFn().mockResolvedValue([{ id: 'recipe-1' }]),
      },
    };

    const prisma = {
      item: {
        findFirst: mockFn().mockResolvedValue(item),
      },
      ingredient: {
        findMany: mockFn().mockResolvedValue([{ id: ingredientId }]),
      },
      recipe: {
        findMany: mockFn(),
      },
      $transaction: jest.fn((fn: (transaction: any) => unknown) => fn(tx)),
    } as any;

    return { service: new RecipesService(prisma), prisma, tx };
  }

  it('accepts exactly one mandatory line for SIMPLE items', async () => {
    const { service, tx } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
    });

    await service.replaceForItem(businessId, itemId, {
      lines: [{ ingredientId, quantityRequired: 1 }],
    });

    expect(tx.recipe.deleteMany).toHaveBeenCalledWith({
      where: { businessId, itemId },
    });
    expect(tx.recipe.createMany).toHaveBeenCalledWith({
      data: [
        {
          businessId,
          itemId,
          ingredientId,
          quantityRequired: 1,
          isOptional: false,
        },
      ],
    });
  });

  it('rejects invalid SIMPLE recipes', async () => {
    const { service } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
    });

    await expect(
      service.replaceForItem(businessId, itemId, {
        lines: [{ ingredientId, quantityRequired: 1, isOptional: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one mandatory line for RECIPE_BASED items', async () => {
    const { service } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
    });

    await expect(
      service.replaceForItem(businessId, itemId, {
        lines: [{ ingredientId, quantityRequired: 1, isOptional: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
