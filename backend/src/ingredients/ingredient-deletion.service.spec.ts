import { Prisma } from '@prisma/client';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService smart deletion', () => {
  const ingredient = {
    id: 'ingredient-1',
    businessId: 'business-1',
    status: 'ACTIVE',
    deletedAt: null,
    currentStock: new Prisma.Decimal(0),
    averageCost: new Prisma.Decimal(0),
  };

  function setup(overrides: Record<string, number> = {}) {
    const count = (name: string) =>
      jest.fn().mockResolvedValue(overrides[name] ?? 0);
    const prisma: any = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(ingredient),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      inventoryMovement: { count: count('inventoryMovements') },
      recipe: { count: count('recipes') },
      serviceIngredient: { count: count('serviceIngredients') },
      itemOption: { count: count('itemOptions') },
      ingredientPurchasePresentation: { count: count('purchasePresentations') },
      orderItemOption: { count: count('orderItemOptions') },
      $queryRaw: jest.fn().mockResolvedValue([{ id: ingredient.id }]),
      $transaction: jest.fn((operation: any) => operation(prisma)),
    };
    return { service: new IngredientsService(prisma), prisma };
  }

  it('hard deletes an unused ingredient with no residual balance', async () => {
    const { service, prisma } = setup();
    await expect(
      service.remove('business-1', ingredient.id),
    ).resolves.toMatchObject({
      deletionMode: 'HARD_DELETE',
      preservedHistory: false,
    });
    expect(prisma.ingredient.delete).toHaveBeenCalledWith({
      where: { id: ingredient.id },
    });
  });

  it('always preserves an ingredient with a purchase presentation', async () => {
    const { service, prisma } = setup({ purchasePresentations: 1 });
    await expect(
      service.remove('business-1', ingredient.id),
    ).resolves.toMatchObject({
      deletionMode: 'SOFT_DELETE',
      preservedHistory: true,
    });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredient.id },
      data: { status: 'INACTIVE', deletedAt: expect.any(Date) },
    });
    expect(prisma.ingredient.delete).not.toHaveBeenCalled();
  });

  it('soft deletes an ingredient with a residual balance without changing stock', async () => {
    const { service, prisma } = setup();
    prisma.ingredient.findFirst.mockResolvedValue({
      ...ingredient,
      currentStock: new Prisma.Decimal(2),
    });
    await expect(
      service.remove('business-1', ingredient.id),
    ).resolves.toMatchObject({ deletionMode: 'SOFT_DELETE', preservedHistory: true });
    expect(prisma.ingredient.delete).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredient.id },
      data: { status: 'INACTIVE', deletedAt: expect.any(Date) },
    });
  });
});
