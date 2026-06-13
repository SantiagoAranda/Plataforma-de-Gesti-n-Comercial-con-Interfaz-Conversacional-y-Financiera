import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IngredientUnit, Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { IngredientsService } from './ingredients.service';

describe('IngredientsService (minStock)', () => {
  const businessId = 'business-1';
  const ingredientId = 'ingredient-1';
  const mockFn = () => jest.fn() as any;

  function createService(overrides: Record<string, any> = {}) {
    const unitsByCode: Record<string, any> = {
      KG: { id: 'unit-kg', code: 'KG', symbol: 'kg', kind: 'WEIGHT' },
      G: { id: 'unit-g', code: 'G', symbol: 'g', kind: 'WEIGHT' },
      LB: { id: 'unit-lb', code: 'LB', symbol: 'lb', kind: 'WEIGHT' },
      L: { id: 'unit-l', code: 'L', symbol: 'l', kind: 'VOLUME' },
      ML: { id: 'unit-ml', code: 'ML', symbol: 'ml', kind: 'VOLUME' },
      UNIT: { id: 'unit-unit', code: 'UNIT', symbol: 'u', kind: 'COUNT' },
      PACKAGE: { id: 'unit-package', code: 'PACKAGE', symbol: 'paquete', kind: 'COMMERCIAL' },
      DOZEN: { id: 'unit-dozen', code: 'DOZEN', symbol: 'docena', kind: 'COMMERCIAL' },
      BOX: { id: 'unit-box', code: 'BOX', symbol: 'caja', kind: 'COMMERCIAL' },
    };
    const unitsById = Object.values(unitsByCode).reduce<Record<string, any>>((acc, unit: any) => {
      acc[unit.id] = unit;
      return acc;
    }, {});
    const conversionFactors: Record<string, string> = {
      'unit-g:unit-g': '1',
      'unit-kg:unit-kg': '1',
      'unit-kg:unit-g': '1000',
      'unit-g:unit-kg': '0.001',
      'unit-lb:unit-g': '500',
      'unit-lb:unit-lb': '1',
      'unit-ml:unit-ml': '1',
      'unit-l:unit-l': '1',
      'unit-l:unit-ml': '1000',
      'unit-ml:unit-l': '0.001',
      'unit-unit:unit-unit': '1',
      'unit-package:unit-unit': '6',
      'unit-dozen:unit-unit': '12',
      'unit-box:unit-unit': '24',
    };
    const prisma = {
      ingredient: {
        create: mockFn(),
        update: mockFn(),
        findFirst: mockFn(),
      },
      unit: {
        findUnique: jest.fn(({ where }: { where: { code?: string; id?: string } }) =>
          Promise.resolve(
            where.id
              ? unitsById[where.id] ?? null
              : unitsByCode[String(where.code).toUpperCase()] ?? null,
          ),
        ),
      },
      unitConversion: {
        findUnique: jest.fn(({ where }: { where: any }) => {
          const key = `${where.fromUnitId_toUnitId.fromUnitId}:${where.fromUnitId_toUnitId.toUnitId}`;
          const factor = conversionFactors[key];
          return Promise.resolve(factor ? { factor: new Prisma.Decimal(factor) } : null);
        }),
      },
      ingredientPurchasePresentation: {
        findMany: mockFn(),
        findFirst: mockFn(),
        create: mockFn(),
        updateMany: mockFn(),
        update: mockFn(),
      },
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        if (Array.isArray(arg)) return Promise.all(arg);
        throw new Error('Unsupported $transaction usage in test');
      }),
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

  it('creates kg->g ingredient without explicit factor using standard 1000', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: 'Beef patty',
      consumptionUnit: IngredientUnit.G,
      purchaseUnit: IngredientUnit.KG,
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseToConsumptionFactor: new Prisma.Decimal('1000'),
      }),
    });
  });

  it('creates l->ml ingredient without explicit factor using standard 1000', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: 'Milk',
      consumptionUnit: IngredientUnit.ML,
      purchaseUnit: IngredientUnit.L,
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseToConsumptionFactor: new Prisma.Decimal('1000'),
      }),
    });
  });

  it('creates same-unit ingredient without explicit factor using standard 1', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: 'Napkin',
      consumptionUnit: IngredientUnit.UNIT,
      purchaseUnit: IngredientUnit.UNIT,
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseToConsumptionFactor: new Prisma.Decimal('1'),
      }),
    });
  });

  it.each([
    ['PACKAGE', 'unit-package', '6'],
    ['DOZEN', 'unit-dozen', '12'],
    ['BOX', 'unit-box', '24'],
  ])('creates unit-stock ingredient with default purchase unit %s without writing it to legacy enum', async (code, unitId, factor) => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: `Coca Cola ${code}`,
      stockUnitId: 'unit-unit',
      defaultPurchaseUnitId: unitId,
      minStock: '6',
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockUnitId: 'unit-unit',
        defaultPurchaseUnitId: unitId,
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.UNIT,
        purchaseToConsumptionFactor: new Prisma.Decimal(factor),
      }),
    });
  });

  it('creates gram-stock ingredient with default purchase unit LB without writing LB to legacy enum', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: 'Potatoes',
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-lb',
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockUnitId: 'unit-g',
        defaultPurchaseUnitId: 'unit-lb',
        consumptionUnit: IngredientUnit.G,
        purchaseUnit: IngredientUnit.KG,
        purchaseToConsumptionFactor: new Prisma.Decimal('500'),
      }),
    });
  });

  it('rejects incompatible default purchase unit with a clear 400 error', async () => {
    const { service } = createService();

    await expect(
      service.create(businessId, {
        name: 'Invalid potatoes',
        stockUnitId: 'unit-g',
        defaultPurchaseUnitId: 'unit-package',
      } as any),
    ).rejects.toThrow(
      'La unidad normal de compra no es compatible con la unidad base del insumo.',
    );
  });

  it('updates an existing unit-stock ingredient to default purchase unit BOX without writing BOX to legacy enum', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Coca Cola',
      consumptionUnit: IngredientUnit.UNIT,
      purchaseUnit: IngredientUnit.UNIT,
      stockUnitId: 'unit-unit',
      defaultPurchaseUnitId: 'unit-package',
      stockUnit: { id: 'unit-unit', code: 'UNIT' },
      defaultPurchaseUnit: { id: 'unit-package', code: 'PACKAGE' },
      _count: { inventoryMovements: 0 },
    });
    prisma.ingredient.update.mockResolvedValue({});

    await service.update(businessId, ingredientId, {
      defaultPurchaseUnitId: 'unit-box',
    } as any);

    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: expect.objectContaining({
        stockUnitId: 'unit-unit',
        defaultPurchaseUnitId: 'unit-box',
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.UNIT,
        purchaseToConsumptionFactor: new Prisma.Decimal('24'),
      }),
    });
  });

  it('rejects custom legacy factors when there is no global UnitConversion', async () => {
    const { service } = createService();

    await expect(
      service.create(businessId, {
        name: 'Custom patty box',
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.KG,
        purchaseToConsumptionFactor: '250',
      } as any),
    ).rejects.toThrow(
      'La unidad normal de compra no es compatible con la unidad base del insumo.',
    );
  });

  it('ignores explicit factor for standard unit pairs and forces standard factor', async () => {
    const { service, prisma } = createService();
    prisma.ingredient.create.mockResolvedValue({});

    await service.create(businessId, {
      name: 'Standard patty box',
      consumptionUnit: IngredientUnit.G,
      purchaseUnit: IngredientUnit.KG,
      purchaseToConsumptionFactor: '250',
    } as any);

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseToConsumptionFactor: new Prisma.Decimal('1000'),
      }),
    });
  });

  it('rejects create when no global conversion exists', async () => {
    const { service } = createService();

    await expect(
      service.create(businessId, {
        name: 'Bottle',
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.KG,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
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

