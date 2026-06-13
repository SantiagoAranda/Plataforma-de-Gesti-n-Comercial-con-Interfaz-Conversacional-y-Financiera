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
      item: {
        findFirst: mockFn(),
        findMany: mockFn(),
      },
      inventoryMovement: {
        findMany: mockFn(),
        findFirst: mockFn(),
        count: mockFn(),
        create: mockFn(),
      },
      unit: {
        findMany: mockFn(),
        findUnique: mockFn(),
      },
      unitConversion: {
        findUnique: mockFn(),
      },
      ingredientPurchasePresentation: {
        findFirst: mockFn(),
      },
      accountingMovement: {
        findFirst: mockFn(),
        create: mockFn(),
      },
      pucCuenta: {
        findUnique: mockFn(),
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
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') return arg(tx);
        if (Array.isArray(arg)) return Promise.all(arg);
        throw new Error('Unsupported $transaction usage in test');
      }),
      ...tx,
    } as any;

    return { service: new InventoryService(prisma), tx, prisma };
  }

  function createServiceWithAccounting(overrides: Record<string, any> = {}) {
    const base = createService(overrides);
    return {
      ...base,
      service: new InventoryService(base.prisma, {} as any),
    };
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

  it('requires unitCost for positive adjustments', async () => {
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
        type: 'ADJUSTMENT_POSITIVE',
        quantity: 1,
        referenceType: 'MANUAL',
        detail: 'found extra stock',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses weighted average cost on negative adjustments without recalculating', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(3),
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-1', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.applyInventoryMovement(tx as any, businessId, {
      ingredientId,
      type: 'ADJUSTMENT_NEGATIVE',
      quantity: 2,
      referenceType: 'MANUAL',
      detail: 'waste',
    });

    expect(movement.unitCost.toString()).toBe('3');
    expect(movement.averageCostAfter.toString()).toBe('3');
  });

  it('rejects new ingredient purchases that would use legacy purchaseToConsumptionFactor', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      purchaseToConsumptionFactor: new Prisma.Decimal(6),
    });
    await expect(
      service.registerPurchase(businessId, {
        ingredientId,
        purchaseQuantity: '2',
        purchaseUnitCost: '12000',
        detail: 'buy packs',
      } as any),
    ).rejects.toThrow('Ingredient must be migrated to the new unit model before purchasing');
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('posts accounting movement for PURCHASE in the same inventory transaction', async () => {
    const { service, tx } = createServiceWithAccounting();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-kg',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-kg',
      code: 'KG',
      symbol: 'kg',
      kind: 'WEIGHT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(1000),
      fromUnit: { id: 'unit-kg', code: 'KG', symbol: 'kg', kind: 'WEIGHT' },
      toUnit: { id: 'unit-g', code: 'G', symbol: 'g', kind: 'WEIGHT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({
        id: 'purchase-movement-1',
        ...data,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        ingredient: { id: ingredientId, name: 'Flour' },
      }),
    );
    tx.ingredient.update.mockResolvedValue({});
    tx.accountingMovement.findFirst.mockResolvedValue(null);
    tx.pucCuenta.findUnique.mockImplementation(({ where }: { where: any }) =>
      Promise.resolve({ code: where.code }),
    );
    tx.accountingMovement.create.mockResolvedValue({ id: 'accounting-1' });

    await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '2',
      purchaseUnitCost: '12000',
    } as any);

    expect(tx.accountingMovement.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        businessId,
        pucCuentaCode: '1435',
        amount: new Prisma.Decimal(24000),
        nature: 'DEBIT',
        detail: 'Compra de inventario: Flour',
        originType: 'MANUAL',
        originId: 'purchase-movement-1',
      }),
    });
    expect(tx.accountingMovement.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        businessId,
        pucCuentaCode: '1110',
        amount: new Prisma.Decimal(24000),
        nature: 'CREDIT',
        detail: 'Contrapartida compra inventario: Flour',
        originType: 'MANUAL',
        originId: 'purchase-movement-1',
      }),
    });
  });

  it('does not duplicate accounting movement for the same InventoryMovement origin', async () => {
    const { service, tx } = createServiceWithAccounting();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(3),
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({
        id: 'adjustment-movement-1',
        ...data,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        ingredient: { id: ingredientId, name: 'Flour' },
      }),
    );
    tx.ingredient.update.mockResolvedValue({});
    tx.accountingMovement.findFirst.mockResolvedValue({ id: 'accounting-existing' });

    await service.registerNegativeAdjustment(businessId, {
      ingredientId,
      quantity: '1',
      detail: 'waste',
    });

    expect(tx.accountingMovement.create).not.toHaveBeenCalled();
    expect(tx.pucCuenta.findUnique).not.toHaveBeenCalled();
  });

  it('does not post accounting automatically for INVENTORY_INITIAL', async () => {
    const { service, tx } = createServiceWithAccounting();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
    });
    tx.inventoryMovement.findFirst.mockResolvedValue(null);
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({
        id: 'initial-movement-1',
        ...data,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        ingredient: { id: ingredientId, name: 'Flour' },
      }),
    );
    tx.ingredient.update.mockResolvedValue({});

    await service.registerInitial(businessId, {
      ingredientId,
      quantity: '10',
      unitCost: '2',
    });

    expect(tx.accountingMovement.create).not.toHaveBeenCalled();
  });

  it('does not create new LEGACY purchase movements for unmigrated ingredients', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      purchaseToConsumptionFactor: new Prisma.Decimal(0),
    });

    await expect(
      service.registerPurchase(businessId, {
        ingredientId,
        purchaseQuantity: '2',
        purchaseUnitCost: '12000',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('standard KG to G purchase enters 1000 g and ignores recipe quantities', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Medallon carne',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-kg',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-kg',
      code: 'KG',
      symbol: 'kg',
      kind: 'WEIGHT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(1000),
      fromUnit: { id: 'unit-kg', code: 'KG', symbol: 'kg', kind: 'WEIGHT' },
      toUnit: { id: 'unit-g', code: 'G', symbol: 'g', kind: 'WEIGHT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-kg-g', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '1000',
    } as any);

    expect(movement.quantity.toString()).toBe('1000');
    expect(movement.unitCost.toString()).toBe('1');
    expect(movement.purchaseMode).toBe('STANDARD');
    expect(movement.conversionDetail).toBe('1 kg = 1000 g');
    expect(tx.recipe.findMany).not.toHaveBeenCalled();
  });

  it('standard UNIT purchase enters 1 unit', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Pan',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-unit',
      defaultPurchaseUnitId: 'unit-unit',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-unit',
      code: 'UNIT',
      symbol: 'u',
      kind: 'COUNT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(1),
      fromUnit: { id: 'unit-unit', code: 'UNIT', symbol: 'u', kind: 'COUNT' },
      toUnit: { id: 'unit-unit', code: 'UNIT', symbol: 'u', kind: 'COUNT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-unit', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '500',
    } as any);

    expect(movement.quantity.toString()).toBe('1');
    expect(movement.unitCost.toString()).toBe('500');
    expect(movement.purchaseMode).toBe('STANDARD');
  });

  it('standard PACKAGE to UNIT purchase enters 6 units', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Coca Cola lata',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-unit',
      defaultPurchaseUnitId: 'unit-package',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-package',
      code: 'PACKAGE',
      symbol: 'paquete',
      kind: 'COUNT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(6),
      fromUnit: { id: 'unit-package', code: 'PACKAGE', symbol: 'paquete', kind: 'COUNT' },
      toUnit: { id: 'unit-unit', code: 'UNIT', symbol: 'u', kind: 'COUNT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-package', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '6000',
    } as any);

    expect(movement.quantity.toString()).toBe('6');
    expect(movement.unitCost.toString()).toBe('1000');
    expect(movement.purchaseMode).toBe('STANDARD');
    expect(movement.purchasePresentationId).toBeNull();
    expect(movement.conversionDetail).toBe('1 paquete = 6 u');
  });

  it('standard BOX to UNIT purchase enters 24 units', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Coca Cola lata',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-unit',
      defaultPurchaseUnitId: 'unit-box',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-box',
      code: 'BOX',
      symbol: 'caja',
      kind: 'COUNT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(24),
      fromUnit: { id: 'unit-box', code: 'BOX', symbol: 'caja', kind: 'COUNT' },
      toUnit: { id: 'unit-unit', code: 'UNIT', symbol: 'u', kind: 'COUNT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-box', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '24000',
    } as any);

    expect(movement.quantity.toString()).toBe('24');
    expect(movement.unitCost.toString()).toBe('1000');
    expect(movement.totalValue.toString()).toBe('24000');
    expect(movement.purchaseMode).toBe('STANDARD');
  });

  it('standard LB to G purchase enters 500 g', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Papas',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-lb',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-lb',
      code: 'LB',
      symbol: 'lb',
      kind: 'WEIGHT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(500),
      fromUnit: { id: 'unit-lb', code: 'LB', symbol: 'lb', kind: 'WEIGHT' },
      toUnit: { id: 'unit-g', code: 'G', symbol: 'g', kind: 'WEIGHT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-lb', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '1200',
    } as any);

    expect(movement.quantity.toString()).toBe('500');
    expect(movement.unitCost.toString()).toBe('2.4');
    expect(movement.conversionDetail).toBe('1 lb = 500 g');
  });

  it('weighted average uses base quantity for standard converted purchases', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Papas',
      currentStock: new Prisma.Decimal(1000),
      averageCost: new Prisma.Decimal(10),
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-kg',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-kg',
      code: 'KG',
      symbol: 'kg',
      kind: 'WEIGHT',
    });
    tx.unitConversion.findUnique.mockResolvedValue({
      factor: new Prisma.Decimal(1000),
      fromUnit: { id: 'unit-kg', code: 'KG', symbol: 'kg', kind: 'WEIGHT' },
      toUnit: { id: 'unit-g', code: 'G', symbol: 'g', kind: 'WEIGHT' },
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-weighted', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchase(businessId, {
      ingredientId,
      purchaseQuantity: '1',
      purchaseUnitCost: '12000',
    } as any);

    expect(movement.quantity.toString()).toBe('1000');
    expect(movement.unitCost.toString()).toBe('12');
    expect(movement.averageCostAfter.toString()).toBe('11');
  });

  it('rejects commercial units in standard UnitConversion purchases', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Medallon carne',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
      stockUnitId: 'unit-g',
      defaultPurchaseUnitId: 'unit-box',
    });
    tx.unit.findUnique.mockResolvedValue({
      id: 'unit-box',
      code: 'BOX',
      symbol: 'caja',
      kind: 'COMMERCIAL',
    });

    await expect(
      service.registerPurchase(businessId, {
        ingredientId,
        purchaseQuantity: '1',
        purchaseUnitCost: '1000',
      } as any),
    ).rejects.toThrow('La unidad de compra no es compatible con la unidad base del insumo.');
    expect(tx.unitConversion.findUnique).not.toHaveBeenCalled();
  });

  it('creates INVENTORY_INITIAL movement and updates stock and average cost', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
    });
    tx.inventoryMovement.findFirst.mockResolvedValue(null);
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'initial-movement-1', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerInitial(businessId, {
      ingredientId,
      quantity: '10',
      unitCost: '2.5',
      detail: 'opening stock',
    });

    expect(movement.type).toBe('INVENTORY_INITIAL');
    expect(movement.quantity.toString()).toBe('10');
    expect(movement.unitCost.toString()).toBe('2.5');
    expect(movement.stockAfter.toString()).toBe('10');
    expect(movement.averageCostAfter.toString()).toBe('2.5');
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'INVENTORY_INITIAL',
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(2.5),
        totalValue: new Prisma.Decimal(25),
        stockAfter: new Prisma.Decimal(10),
        averageCostAfter: new Prisma.Decimal(2.5),
        referenceType: 'MANUAL',
        detail: 'opening stock',
      }),
    }));
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: {
        currentStock: new Prisma.Decimal(10),
        averageCost: new Prisma.Decimal(2.5),
      },
    });
  });

  it('blocks INVENTORY_INITIAL when ingredient already has movements', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(5),
      averageCost: new Prisma.Decimal(2),
    });
    tx.inventoryMovement.findFirst.mockResolvedValue({ id: 'existing-movement' });

    await expect(
      service.registerInitial(businessId, {
        ingredientId,
        quantity: '10',
        unitCost: '2.5',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('blocks INVENTORY_INITIAL with quantity zero without changing stock or cost', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(0),
      averageCost: new Prisma.Decimal(0),
    });
    tx.inventoryMovement.findFirst.mockResolvedValue(null);

    await expect(
      service.registerInitial(businessId, {
        ingredientId,
        quantity: '0',
        unitCost: '2.5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('reconciles stock and average cost from kardex movements', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(999),
      averageCost: new Prisma.Decimal(999),
    });
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        type: 'INVENTORY_INITIAL',
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(2),
      },
      {
        type: 'PURCHASE',
        quantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal(4),
      },
      {
        type: 'SALE',
        quantity: new Prisma.Decimal(5),
        unitCost: new Prisma.Decimal(3),
      },
      {
        type: 'ADJUSTMENT_NEGATIVE',
        quantity: new Prisma.Decimal(2),
        unitCost: new Prisma.Decimal(3),
      },
      {
        type: 'ADJUSTMENT_POSITIVE',
        quantity: new Prisma.Decimal(7),
        unitCost: new Prisma.Decimal(5),
      },
    ]);
    tx.ingredient.update.mockResolvedValue({});

    const result = await service.reconcileIngredient(businessId, ingredientId);

    expect(result.previousStock.toString()).toBe('999');
    expect(result.previousAverageCost.toString()).toBe('999');
    expect(result.recalculatedStock.toString()).toBe('20');
    expect(result.recalculatedAverageCost.toString()).toBe('3.7');
    expect(result.movementsProcessed).toBe(5);
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: ingredientId },
      data: {
        currentStock: new Prisma.Decimal(20),
        averageCost: new Prisma.Decimal('3.7'),
      },
    });
  });

  it('does not reconcile an ingredient from another business', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue(null);

    await expect(
      service.reconcileIngredient('business-2', ingredientId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.inventoryMovement.findMany).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('does not register purchase for an ingredient from another business', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue(null);

    await expect(
      service.registerPurchase('business-2', {
        ingredientId,
        purchaseQuantity: '1',
        purchaseUnitCost: '100',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('does not list kardex for an ingredient from another business', async () => {
    const { service, tx, prisma } = createService();
    tx.ingredient.findFirst.mockResolvedValue(null);

    await expect(
      service.listKardex('business-2', ingredientId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.inventoryMovement.findMany).not.toHaveBeenCalled();
  });

  it('creates PURCHASE_RETURN movement, decreases stock, and recalculates average cost using return unitCost', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(3),
    });
    tx.inventoryMovement.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'movement-1', ...data }),
    );
    tx.ingredient.update.mockResolvedValue({});

    const movement = await service.registerPurchaseReturn(businessId, {
      ingredientId,
      quantity: 4,
      unitCost: 2,
      detail: 'return to supplier',
    } as any);

    expect(movement.type).toBe('PURCHASE_RETURN');
    expect(movement.stockAfter.toString()).toBe('6');
    expect(movement.averageCostAfter.toString()).toBe('3.666667');
  });

  it('blocks PURCHASE_RETURN when stock is insufficient', async () => {
    const { service, tx } = createService();
    tx.ingredient.findFirst.mockResolvedValue({
      id: ingredientId,
      businessId,
      name: 'Flour',
      currentStock: new Prisma.Decimal(2),
      averageCost: new Prisma.Decimal(3),
    });

    await expect(
      service.registerPurchaseReturn(businessId, {
        ingredientId,
        quantity: 3,
        unitCost: 2,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.update).not.toHaveBeenCalled();
  });

  it('consumes stock and creates SALE movement for SIMPLE item sales', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Bread',
      type: 'PRODUCT',
      status: 'ACTIVE',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.findFirst.mockResolvedValue({
      stockAfter: new Prisma.Decimal(10),
      averageCostAfter: new Prisma.Decimal(3),
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
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId,
        ingredientId: null,
        itemId: 'item-1',
        type: 'SALE',
        referenceType: 'ORDER_ITEM',
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        quantity: new Prisma.Decimal(1),
        unitCost: new Prisma.Decimal(3),
        totalValue: new Prisma.Decimal(3),
        stockAfter: new Prisma.Decimal(9),
        averageCostAfter: new Prisma.Decimal(3),
      }),
    }));
    expect(tx.ingredient.update).not.toHaveBeenCalled();
    expect(tx.recipe.findMany).not.toHaveBeenCalled();
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

  it('consumes mandatory and optional ingredients when legacy order item has no exclusions', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-1',
        quantityRequired: new Prisma.Decimal(2),
        isOptional: false,
      },
      {
        ingredientId: 'ingredient-optional',
        quantityRequired: new Prisma.Decimal(1),
        isOptional: true,
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      { id: 'ingredient-1', name: 'Bread', currentStock: new Prisma.Decimal(10) },
      { id: 'ingredient-optional', name: 'Mayo', currentStock: new Prisma.Decimal(10) },
    ]);
    tx.ingredient.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        businessId,
        name: where.id,
        currentStock: new Prisma.Decimal(10),
        averageCost: new Prisma.Decimal(1),
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
            quantity: 1,
            itemNameSnapshot: 'Burger',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
          },
        ],
      },
    );

    expect(movements).toHaveLength(2);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ingredientId: 'ingredient-1' }),
    }));
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ingredientId: 'ingredient-optional' }),
    }));
  });

  it('does not consume excluded optional ingredients for RECIPE_BASED item sales', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-1',
        quantityRequired: new Prisma.Decimal(2),
        isOptional: false,
      },
      {
        ingredientId: 'ingredient-optional',
        quantityRequired: new Prisma.Decimal(1),
        isOptional: true,
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      { id: 'ingredient-1', name: 'Bread', currentStock: new Prisma.Decimal(10) },
    ]);
    tx.ingredient.findFirst.mockResolvedValue({
      id: 'ingredient-1',
      businessId,
      name: 'Bread',
      currentStock: new Prisma.Decimal(10),
      averageCost: new Prisma.Decimal(1),
    });
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
            quantity: 1,
            itemNameSnapshot: 'Burger',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
            excludedOptionalIngredientIds: ['ingredient-optional'],
          },
        ],
      },
    );

    expect(movements).toHaveLength(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ingredientId: 'ingredient-1' }),
    }));
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

  it('does not affect stock for PRODUCT item sales with inventoryMode NONE', async () => {
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
            itemNameSnapshot: 'Sticker',
            itemTypeSnapshot: 'PRODUCT',
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
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Bread',
      type: 'PRODUCT',
      status: 'ACTIVE',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.findFirst.mockResolvedValue({
      stockAfter: new Prisma.Decimal(2),
      averageCostAfter: new Prisma.Decimal(3),
    });

    await expect(
      service.applyInventoryConsumptionForOrder(tx as any, businessId, {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 3,
            itemNameSnapshot: 'Bread',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'SIMPLE',
          },
        ],
      }),
    ).rejects.toThrow(
      'Stock insuficiente para Bread. Disponible: 2, requerido: 3.',
    );

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.recipe.findMany).not.toHaveBeenCalled();
  });

  it('blocks SIMPLE item sales when the item has no initial stock movement', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Bread',
      type: 'PRODUCT',
      status: 'ACTIVE',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.findFirst.mockResolvedValue(null);

    await expect(
      service.applyInventoryConsumptionForOrder(tx as any, businessId, {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 3,
            itemNameSnapshot: 'Bread',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'SIMPLE',
          },
        ],
      }),
    ).rejects.toThrow(
      'Bread no tiene stock disponible.',
    );

    expect(tx.recipe.findMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('blocks RECIPE_BASED item sales without recipe using a business message', async () => {
    const { service, tx } = createService();
    tx.recipe.findMany.mockResolvedValue([]);

    await expect(
      service.applyInventoryConsumptionForOrder(tx as any, businessId, {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 3,
            itemNameSnapshot: 'Hamburguesa',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
          },
        ],
      }),
    ).rejects.toThrow(
      'El producto Hamburguesa usa inventario por receta, pero no tiene receta configurada.',
    );

    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('blocks RECIPE_BASED item sales when an ingredient has insufficient stock', async () => {
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
        name: 'Carne',
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
            itemNameSnapshot: 'Hamburguesa',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
          },
        ],
      }),
    ).rejects.toThrow('Insufficient stock for ingredient Carne');

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

  it('marks SIMPLE item with stock as sellable', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Llaveros',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.count.mockResolvedValue(1);
    tx.inventoryMovement.findFirst.mockResolvedValue({
      stockAfter: new Prisma.Decimal(5),
      averageCostAfter: new Prisma.Decimal(2),
    });

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);

    expect(result.sellable).toBe(true);
    expect(result.status).toBe('SELLABLE');
  });

  it('marks SIMPLE item without movements as not sellable', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Llaveros',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.count.mockResolvedValue(0);
    tx.inventoryMovement.findFirst.mockResolvedValue(null);

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);

    expect(result.sellable).toBe(false);
    expect(result.status).toBe('MISSING_INITIAL_STOCK');
  });

  it('marks RECIPE_BASED item without recipe as not sellable', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Hamburguesa',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      recipes: [],
    });

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);

    expect(result.sellable).toBe(false);
    expect(result.status).toBe('MISSING_RECIPE');
  });

  it('marks RECIPE_BASED item with insufficient ingredient stock as not sellable', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Hamburguesa',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      recipes: [
        {
          ingredientId: 'ingredient-pan',
          quantityRequired: new Prisma.Decimal(1),
          isOptional: false,
          ingredient: {
            id: 'ingredient-pan',
            name: 'Pan de hamburguesa',
            currentStock: new Prisma.Decimal(0),
            consumptionUnit: 'UNIT',
            customUnitLabel: null,
          },
        },
      ],
    });

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);

    expect(result.sellable).toBe(false);
    expect(result.status).toBe('INSUFFICIENT_RECIPE_STOCK');
    expect(result.message).toBe(
      'Hamburguesa no tiene stock disponible.',
    );
  });

  it('marks NONE item as sellable', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Sticker digital',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'NONE',
      recipes: [],
    });

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);

    expect(result.sellable).toBe(true);
    expect(result.status).toBe('SELLABLE');
  });

  it('RECIPE_BASED con cantidad 3 multiplica consumo de ingredientes', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Hamburguesa',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      recipes: [
        {
          ingredientId: 'ingredient-pan',
          quantityRequired: new Prisma.Decimal(250),
          isOptional: false,
          ingredient: {
            id: 'ingredient-pan',
            name: 'Pan de hamburguesa',
            currentStock: new Prisma.Decimal(100),
            consumptionUnit: 'G',
            customUnitLabel: null,
          },
        },
      ],
    });

    const result = await service.getItemSellability(businessId, 'item-1', 3, tx as any);
    expect(result.sellable).toBe(false);
    expect(result.missingItems?.[0].required.toString()).toBe('750');
  });

  it('RECIPE_BASED con stock para 1 unidad pero no para 3 bloquea la confirmación', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Hamburguesa',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      recipes: [
        {
          ingredientId: 'ingredient-pan',
          quantityRequired: new Prisma.Decimal(250),
          isOptional: false,
          ingredient: {
            id: 'ingredient-pan',
            name: 'Pan de hamburguesa',
            currentStock: new Prisma.Decimal(250),
            consumptionUnit: 'G',
            customUnitLabel: null,
          },
        },
      ],
    });
    tx.recipe.findMany.mockResolvedValue([
      {
        ingredientId: 'ingredient-pan',
        quantityRequired: new Prisma.Decimal(250),
        isOptional: false,
        ingredient: {
          id: 'ingredient-pan',
          name: 'Pan de hamburguesa',
          currentStock: new Prisma.Decimal(250),
        },
      },
    ]);
    tx.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-pan',
        name: 'Pan de hamburguesa',
        currentStock: new Prisma.Decimal(250),
      },
    ]);

    await expect(
      service.applyInventoryConsumptionForOrder(tx as any, businessId, {
        id: 'order-1',
        items: [
          {
            id: 'order-item-1',
            itemId: 'item-1',
            quantity: 3,
            itemNameSnapshot: 'Hamburguesa',
            itemTypeSnapshot: 'PRODUCT',
            inventoryModeSnapshot: 'RECIPE_BASED',
            excludedOptionalIngredientIds: null,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('SIMPLE con stock 2, minStock 3, venta de 1: permitida con estado LOW_STOCK', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Llaveros',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
      minStock: new Prisma.Decimal(3),
      recipes: [],
    });
    tx.inventoryMovement.count.mockResolvedValue(1);
    tx.inventoryMovement.findFirst.mockResolvedValue({
      stockAfter: new Prisma.Decimal(2),
      averageCostAfter: new Prisma.Decimal(10),
    });

    const result = await service.getItemSellability(businessId, 'item-1', 1, tx as any);
    expect(result.sellable).toBe(true);
    expect(result.status).toBe('LOW_STOCK');
    expect(result.message).toBe('Llaveros tiene stock bajo.');
  });

  it('SIMPLE con stock 2, venta de 5: bloqueada con mensaje de stock insuficiente', async () => {
    const { service, tx } = createService();
    tx.item.findFirst.mockResolvedValue({
      id: 'item-1',
      businessId,
      name: 'Llaveros',
      status: 'ACTIVE',
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
      recipes: [],
    });
    tx.inventoryMovement.count.mockResolvedValue(1);
    tx.inventoryMovement.findFirst.mockResolvedValue({
      stockAfter: new Prisma.Decimal(2),
      averageCostAfter: new Prisma.Decimal(10),
    });

    const result = await service.getItemSellability(businessId, 'item-1', 5, tx as any);
    expect(result.sellable).toBe(false);
    expect(result.status).toBe('NO_STOCK');
    expect(result.message).toBe('Stock insuficiente para Llaveros. Disponible: 2, requerido: 5.');
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

    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
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
    }));

    expect(tx.inventoryMovement.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        orderItemId: 'order-item-2',
        stockAfter: new Prisma.Decimal(8),
        averageCostAfter: new Prisma.Decimal(4),
      }),
    }));

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

  it('marks outOfStock and lowStock flags in inventory summary', async () => {
    const { service, prisma } = createService();

    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'i-1',
        businessId,
        name: 'Flour',
        status: 'ACTIVE',
        consumptionUnit: 'g',
        purchaseUnit: 'kg',
        purchaseToConsumptionFactor: new Prisma.Decimal(1000),
        currentStock: new Prisma.Decimal(0),
        averageCost: new Prisma.Decimal(2),
        minStock: new Prisma.Decimal(10),
      },
      {
        id: 'i-2',
        businessId,
        name: 'Sugar',
        status: 'ACTIVE',
        consumptionUnit: 'g',
        purchaseUnit: 'kg',
        purchaseToConsumptionFactor: new Prisma.Decimal(1000),
        currentStock: new Prisma.Decimal(5),
        averageCost: new Prisma.Decimal(1),
        minStock: new Prisma.Decimal(10),
      },
      {
        id: 'i-3',
        businessId,
        name: 'Oil',
        status: 'ACTIVE',
        consumptionUnit: 'ml',
        purchaseUnit: 'l',
        purchaseToConsumptionFactor: new Prisma.Decimal(1000),
        currentStock: new Prisma.Decimal(5),
        averageCost: new Prisma.Decimal(1),
        minStock: new Prisma.Decimal(0),
      },
      {
        id: 'i-4',
        businessId,
        name: 'Salt',
        status: 'ACTIVE',
        consumptionUnit: 'g',
        purchaseUnit: 'kg',
        purchaseToConsumptionFactor: new Prisma.Decimal(1000),
        currentStock: new Prisma.Decimal(20),
        averageCost: new Prisma.Decimal(1),
        minStock: new Prisma.Decimal(10),
      },
    ]);

    const summary = await service.getSummary(businessId, {} as any);

    const byName = new Map(summary.map((row: any) => [row.name, row]));
    expect(byName.get('Flour')?.outOfStock).toBe(true);
    expect(byName.get('Flour')?.lowStock).toBe(false);

    expect(byName.get('Sugar')?.outOfStock).toBe(false);
    expect(byName.get('Sugar')?.lowStock).toBe(true);

    expect(byName.get('Oil')?.outOfStock).toBe(false);
    expect(byName.get('Oil')?.lowStock).toBe(false);

    expect(byName.get('Salt')?.outOfStock).toBe(false);
    expect(byName.get('Salt')?.lowStock).toBe(false);
  });

  it('returns paginated global kardex movements filtered by businessId', async () => {
    const { service, prisma } = createService();

    prisma.inventoryMovement.count.mockResolvedValue(2);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'm-2',
        businessId,
        ingredientId,
        type: 'PURCHASE',
        occurredAt: new Date('2026-05-10T00:00:00.000Z'),
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        ingredient: { id: ingredientId, name: 'Flour', consumptionUnit: 'g' },
      },
      {
        id: 'm-1',
        businessId,
        ingredientId,
        type: 'SALE',
        occurredAt: new Date('2026-05-09T00:00:00.000Z'),
        createdAt: new Date('2026-05-09T00:00:00.000Z'),
        ingredient: { id: ingredientId, name: 'Flour', consumptionUnit: 'g' },
      },
    ]);

    const result = await service.listGlobalKardex(businessId, {
      page: 1,
      limit: 25,
    } as any);

    expect(result.meta).toEqual({
      page: 1,
      limit: 25,
      total: 2,
      totalPages: 1,
    });
    expect(Array.isArray(result.data)).toBe(true);

    expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
      where: { businessId },
    });
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId },
        skip: 0,
        take: 25,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        include: expect.objectContaining({
          ingredient: { select: { id: true, name: true, consumptionUnit: true } },
          item: { select: { id: true, name: true } },
        }),
      }),
    );
  });

  it('applies ingredientId, type and date filters to global kardex query', async () => {
    const { service, prisma } = createService();
    prisma.inventoryMovement.count.mockResolvedValue(0);
    prisma.inventoryMovement.findMany.mockResolvedValue([]);

    await service.listGlobalKardex(businessId, {
      ingredientId: 'ingredient-1',
      type: 'SALE',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      page: 2,
      limit: 20,
    } as any);

    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId,
          ingredientId: 'ingredient-1',
          type: 'SALE',
          occurredAt: expect.any(Object),
        }),
        skip: 20,
        take: 20,
      }),
    );
  });
});
