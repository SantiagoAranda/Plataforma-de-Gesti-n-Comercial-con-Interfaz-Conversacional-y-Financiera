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
      item: {
        findFirst: mockFn().mockResolvedValue(item),
      },
      ingredient: {
        findMany: mockFn().mockResolvedValue([
          { id: ingredientId, name: 'Harina', status: 'ACTIVE' },
        ]),
      },
      recipe: {
        deleteMany: mockFn().mockResolvedValue({ count: 1 }),
        createMany: mockFn().mockResolvedValue({ count: 1 }),
        findMany: mockFn().mockResolvedValue([{ id: 'recipe-1' }]),
      },
      $queryRaw: mockFn().mockResolvedValue([{ id: ingredientId }]),
    };

    const prisma = {
      item: {
        findFirst: mockFn().mockResolvedValue(item),
      },
      ingredient: { findMany: mockFn() },
      recipe: {
        findMany: mockFn(),
      },
      $transaction: jest.fn((fn: (transaction: any) => unknown) => fn(tx)),
    } as any;

    return { service: new RecipesService(prisma), prisma, tx };
  }

  it('rejects recipes for SIMPLE items', async () => {
    const { service, tx } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
    });

    await expect(
      service.replaceForItem(businessId, itemId, {
        lines: [{ ingredientId, quantityRequired: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.recipe.deleteMany).not.toHaveBeenCalled();
    expect(tx.recipe.createMany).not.toHaveBeenCalled();
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
        lines: [{ ingredientId, quantityRequired: '1', isOptional: true }],
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
        lines: [{ ingredientId, quantityRequired: '1', isOptional: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads recipes in bulk only for items from the same business', async () => {
    const { service, prisma } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
    });
    prisma.item.findMany = mockFn().mockResolvedValue([{ id: itemId }]);
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'recipe-1',
        itemId,
        ingredientId,
        ingredient: { id: ingredientId, status: 'ACTIVE' },
      },
    ]);

    const result = await service.getBulkForItems(businessId, [
      itemId,
      itemId,
      'other-business-item',
    ]);

    expect(prisma.item.findMany).toHaveBeenCalledWith({
      where: {
        businessId,
        id: { in: [itemId, 'other-business-item'] },
      },
      select: { id: true },
    });
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId,
          itemId: { in: [itemId] },
        },
      }),
    );
    expect(Object.keys(result)).toEqual([itemId]);
    expect(result[itemId]).toHaveLength(1);
  });

  it('rejects the final recipe state and identifies inactive ingredients', async () => {
    const { service, tx } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
    });
    tx.ingredient.findMany.mockResolvedValue([
      { id: ingredientId, name: 'Leche', status: 'INACTIVE' },
    ]);

    await expect(
      service.replaceForItem(businessId, itemId, {
        lines: [{ ingredientId, quantityRequired: '1' }],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'INACTIVE_RECIPE_INGREDIENT',
        inactiveIngredients: [{ id: ingredientId, name: 'Leche' }],
      },
    });
    expect(tx.recipe.deleteMany).not.toHaveBeenCalled();
  });

  it('filters review recipes only within requested business item ids', async () => {
    const { service, prisma } = createService({
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
    });
    prisma.item.findMany = mockFn().mockResolvedValue([{ id: itemId }]);
    prisma.recipe.findMany.mockResolvedValue([
      {
        id: 'recipe-1',
        itemId,
        ingredientId,
        ingredient: { id: ingredientId, status: 'INACTIVE' },
      },
    ]);

    const result = await service.getBulkForItems(
      businessId,
      [itemId, 'other-business-item'],
      true,
    );

    expect(prisma.item.findMany).toHaveBeenCalledWith({
      where: {
        businessId,
        id: { in: [itemId, 'other-business-item'] },
        recipes: { some: { ingredient: { status: 'INACTIVE' } } },
      },
      select: { id: true },
    });
    expect(Object.keys(result)).toEqual([itemId]);
  });
});
