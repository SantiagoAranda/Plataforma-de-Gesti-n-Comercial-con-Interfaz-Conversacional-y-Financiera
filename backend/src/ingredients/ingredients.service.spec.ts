import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService (minStock)', () => {
  const businessId = 'business-1';
  const ingredientId = 'ingredient-1';
  const mockFn = () => jest.fn() as any;

  function createService(overrides: Record<string, any> = {}) {
    const prisma = {
      ingredient: {
        create: mockFn(),
        update: mockFn(),
        findFirst: mockFn(),
      },
      ...overrides,
    } as any;

    return { service: new IngredientsService(prisma), prisma };
  }

  it('creates ingredient with minStock', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({
      id: ingredientId,
      businessId,
      minStock: new Prisma.Decimal('2.5'),
    });

    await service.create(businessId, {
      name: 'Flour',
      consumptionUnit: 'g',
      purchaseUnit: 'kg',
      purchaseToConsumptionFactor: '1000',
      minStock: '2.5',
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId,
        minStock: new Prisma.Decimal('2.5'),
      }),
    });
  });

  it('rejects negative minStock on create', async () => {
    const { service } = createService();

    await expect(
      service.create(businessId, {
        name: 'Flour',
        consumptionUnit: 'g',
        purchaseUnit: 'kg',
        purchaseToConsumptionFactor: '1000',
        minStock: '-1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates minStock', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
    });
    prisma.ingredient.update.mockResolvedValue({
      id: ingredientId,
      businessId,
      minStock: new Prisma.Decimal('1'),
    });

    await service.update(businessId, ingredientId, { minStock: '1' } as any);

    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: expect.objectContaining({
        minStock: new Prisma.Decimal('1'),
      }),
    });
  });

  it('rejects negative minStock on update', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
    });

    await expect(
      service.update(businessId, ingredientId, { minStock: '-0.1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows minStock = "0"', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await expect(
      service.create(businessId, {
        name: 'Flour',
        consumptionUnit: 'g',
        purchaseUnit: 'kg',
        purchaseToConsumptionFactor: '1000',
        minStock: '0',
      } as any),
    ).resolves.toBeDefined();
  });
});

