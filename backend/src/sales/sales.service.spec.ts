import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { SalesService } from './sales.service';

describe('SalesService.findAll', () => {
  const businessId = 'business-1';

  function createService(orders: any[], reservations: any[]) {
    const prisma = {
      order: {
        findMany: (jest.fn() as any).mockResolvedValue(orders),
      },
      reservation: {
        findMany: (jest.fn() as any).mockResolvedValue(reservations),
      },
      unitConversion: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
      },
    } as any;

    return new SalesService(prisma, {} as any, {} as any, {} as any);
  }

  it('maps mixed manual orders without assuming the first line is the only type', async () => {
    const createdAt = new Date('2026-06-24T12:00:00.000Z');
    const service = createService(
      [
        {
          id: 'order-1',
          customerName: null,
          customerWhatsapp: null,
          paymentMethod: 'CASH',
          total: new Prisma.Decimal(150),
          status: 'SENT',
          inventoryPostedAt: null,
          accountingPostedAt: null,
          createdAt,
          origin: 'MANUAL',
          items: [
            {
              id: 'line-product',
              itemId: 'product-1',
              itemNameSnapshot: 'Producto',
              itemTypeSnapshot: 'PRODUCT',
              quantity: 1,
              unitPrice: new Prisma.Decimal(100),
              lineTotal: new Prisma.Decimal(100),
              inventoryModeSnapshot: 'NONE',
              durationMinutesSnapshot: null,
              excludedOptionalIngredientIds: null,
              item: null,
              options: [],
            },
            {
              id: 'line-service',
              itemId: 'service-1',
              itemNameSnapshot: 'Servicio',
              itemTypeSnapshot: 'SERVICE',
              quantity: 1,
              unitPrice: new Prisma.Decimal(50),
              lineTotal: new Prisma.Decimal(50),
              inventoryModeSnapshot: 'NONE',
              durationMinutesSnapshot: 60,
              excludedOptionalIngredientIds: null,
              item: null,
              options: [],
            },
          ],
        },
      ],
      [],
    );

    await expect(service.findAll(businessId)).resolves.toEqual([
      expect.objectContaining({
        id: 'order-1',
        items: [
          expect.objectContaining({ name: 'Producto' }),
          expect.objectContaining({ name: 'Servicio', durationMin: 60 }),
        ],
      }),
    ]);
  });

  it('maps an incomplete reservation safely when its item relation is missing', async () => {
    const createdAt = new Date('2026-06-24T12:00:00.000Z');
    const service = createService(
      [],
      [
        {
          id: 'reservation-1',
          itemId: 'missing-service',
          item: null,
          customerName: null,
          customerWhatsapp: null,
          paymentMethod: null,
          status: 'PENDING',
          inventoryPostedAt: null,
          createdAt,
          updatedAt: createdAt,
          origin: 'MANUAL',
          date: createdAt,
          startMinute: 600,
        },
      ],
    );

    await expect(service.findAll(businessId)).resolves.toEqual([
      expect.objectContaining({
        id: 'reservation-1',
        total: 0,
        inventoryPostedAt: null,
        accountingPostedAt: null,
        items: [
          expect.objectContaining({
            name: 'Servicio no disponible',
            price: 0,
            durationMin: null,
          }),
        ],
      }),
    ]);
  });
});

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

    return { service: new SalesService(prisma, accountingService, inventoryService, {} as any), prisma, inventoryService };
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

describe('SalesService personalized order lines', () => {
  const businessId = 'business-1';
  const item = {
    id: 'item-1',
    businessId,
    name: 'Arepa',
    status: 'ACTIVE',
    type: 'PRODUCT',
    inventoryMode: 'RECIPE_BASED',
    price: new Prisma.Decimal(10000),
    durationMinutes: null,
    recipes: [],
    optionGroups: [{ id: 'group-1' }],
  };

  function createService(orderOverrides: Record<string, any> = {}) {
    const tx: any = {
      order: {
        update: jest.fn(),
        findUniqueOrThrow: (jest.fn() as any).mockResolvedValue({
          id: 'order-1',
          items: [],
        }),
      },
      orderItem: {
        deleteMany: jest.fn(),
        create: (jest.fn() as any).mockResolvedValue({}),
      },
    };
    const prisma: any = {
      item: {
        findMany: (jest.fn() as any).mockResolvedValue([item]),
      },
      order: {
        create: (jest.fn() as any).mockResolvedValue({
          id: 'order-1',
          origin: 'MANUAL',
          items: [],
        }),
        findFirst: (jest.fn() as any).mockResolvedValue({
          id: 'order-1',
          businessId,
          status: 'SENT',
          inventoryPostedAt: null,
          accountingPostedAt: null,
          items: [],
          ...orderOverrides,
        }),
      },
      $transaction: jest.fn((fn: (innerTx: any) => unknown) => fn(tx)),
    };
    const itemOptionsService = {
      resolveSelectionsForOrderLine: jest
        .fn()
        .mockImplementation((_businessId, _itemId, quantity: number, selections: any[]) =>
          Promise.resolve({
            optionsTotal: new Prisma.Decimal(
              selections[0]?.optionId === 'cheese' ? 2000 : 1000,
            ),
            snapshots: [
              {
                groupTitleSnapshot: 'Extras',
                optionNameSnapshot:
                  selections[0]?.optionId === 'cheese' ? 'Queso' : 'Aguacate',
                priceDeltaSnapshot: new Prisma.Decimal(
                  selections[0]?.optionId === 'cheese' ? 2000 : 1000,
                ),
                totalQuantitySnapshot: new Prisma.Decimal(quantity),
              },
            ],
          }),
        ),
    } as any;
    const inventoryService = {
      expandOrderItemsToIngredients: (jest.fn() as any).mockResolvedValue([]),
      validateStockAvailability: (jest.fn() as any).mockResolvedValue({
        ok: true,
        requirements: [],
      }),
    } as any;
    return {
      service: new SalesService(
        prisma,
        {} as any,
        inventoryService,
        itemOptionsService,
      ),
      prisma,
      tx,
      itemOptionsService,
    };
  }

  it('creates repeated personalized manual lines with backend snapshots', async () => {
    const { service, prisma, itemOptionsService } = createService();

    await service.create(businessId, {
      type: 'PRODUCTO',
      status: 'PENDIENTE',
      origin: 'MANUAL',
      items: [
        {
          itemId: item.id,
          quantity: 1,
          optionSelections: [
            { groupId: 'group-1', optionId: 'cheese', action: 'ADD' },
          ],
        },
        {
          itemId: item.id,
          quantity: 2,
          optionSelections: [
            { groupId: 'group-1', optionId: 'avocado', action: 'ADD' },
          ],
        },
      ],
    });

    expect(itemOptionsService.resolveSelectionsForOrderLine).toHaveBeenCalledTimes(2);
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          total: 34000,
          items: {
            create: [
              expect.objectContaining({
                itemId: item.id,
                unitPrice: new Prisma.Decimal(12000),
                lineTotalSnapshot: new Prisma.Decimal(12000),
                options: { create: [expect.objectContaining({ optionNameSnapshot: 'Queso' })] },
              }),
              expect.objectContaining({
                itemId: item.id,
                quantity: 2,
                unitPrice: new Prisma.Decimal(11000),
                lineTotalSnapshot: new Prisma.Decimal(22000),
              }),
            ],
          },
        }),
      }),
    );
  });

  it('replaces personalized lines when editing a pending public order', async () => {
    const { service, tx } = createService({ origin: 'PUBLIC_STORE' });

    await service.update(
      businessId,
      'order-1',
      {
        items: [
          {
            itemId: item.id,
            quantity: 2,
            optionSelections: [
              { groupId: 'group-1', optionId: 'cheese', action: 'ADD' },
            ],
          },
        ],
      },
      'ORDER',
    );

    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        unitPrice: new Prisma.Decimal(12000),
        lineTotal: new Prisma.Decimal(24000),
        options: { create: [expect.objectContaining({ optionNameSnapshot: 'Queso' })] },
      }),
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { total: 24000 },
    });
  });

  it.each([
    ['inventoryPostedAt', new Date()],
    ['accountingPostedAt', new Date()],
  ])('blocks editing when %s is set', async (field, value) => {
    const { service, tx } = createService({ [field]: value });

    await expect(
      service.update(businessId, 'order-1', { items: [{ itemId: item.id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
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
    const service = new SalesService(prisma, accountingService, inventoryService, {} as any);

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

    return { service: new SalesService(prisma, accountingService, inventoryService, {} as any), prisma };
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
    const service = new SalesService(prisma, accountingService, inventoryService, {} as any);

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
      { sourceType: 'ORDER' },
    );
    expect(accountingService.postOrderMovements).not.toHaveBeenCalled();
  });
});
