import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  it('reactivates an inactive ingredient', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      status: 'INACTIVE',
    });
    prisma.ingredient.update.mockResolvedValue({
      id: ingredientId,
      businessId,
      status: 'ACTIVE',
    });

    const result = await service.reactivate(businessId, ingredientId);

    expect(result.status).toBe('ACTIVE');
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: { status: 'ACTIVE' },
    });
  });

  it('returns active ingredient without updating when reactivate is idempotent', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      status: 'ACTIVE',
    });

    const result = await service.reactivate(businessId, ingredientId);

    expect(result.status).toBe('ACTIVE');
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('does not expose ingredient from another business on findOne/update/reactivate', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue(null);

    await expect(service.findOne('business-2', ingredientId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update('business-2', ingredientId, { minStock: '1' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.reactivate('business-2', ingredientId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });
});

