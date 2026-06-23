import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PublicService } from './public.service';

describe('PublicService', () => {
  const business = { id: 'business-1', slug: 'demo', status: 'ACTIVE' };
  const baseItem = {
    id: 'item-1',
    businessId: business.id,
    name: 'Burger',
    type: 'PRODUCT',
    status: 'ACTIVE',
    price: new Prisma.Decimal(10000),
    durationMinutes: null,
    inventoryMode: 'RECIPE_BASED',
    optionGroups: [],
    recipes: [
      {
        ingredientId: 'ingredient-required',
        isOptional: false,
        ingredient: { id: 'ingredient-required', name: 'Pan' },
      },
      {
        ingredientId: 'ingredient-optional',
        isOptional: true,
        ingredient: { id: 'ingredient-optional', name: 'Mayonesa' },
      },
    ],
  };

  const mockFn = () => jest.fn() as any;

  function createService(items = [baseItem]) {
    const getItemSellability = (jest.fn() as any).mockResolvedValue({
      sellable: true,
      status: 'SELLABLE',
    });
    const getItemsSellabilityBulk = (jest.fn() as any).mockImplementation(
      (_businessId: string, requests: any[]) =>
        Promise.resolve(
          requests.map(() => ({ sellable: true, status: 'SELLABLE' })),
        ),
    );
    const resolveSelectionsForOrderLine = (jest.fn() as any).mockResolvedValue({
      optionsTotal: new Prisma.Decimal(0),
      snapshots: [],
    });
    const prisma = {
      business: {
        findFirst: mockFn().mockResolvedValue(business),
      },
      item: {
        findMany: mockFn().mockResolvedValue(items),
      },
      order: {
        create: mockFn().mockResolvedValue({
          id: 'order-1',
          publicToken: 'public-token',
          items: [{ lineTotal: new Prisma.Decimal(10000) }],
          origin: 'PUBLIC_STORE',
        }),
        update: mockFn().mockResolvedValue({}),
      },
    } as any;

    return {
      service: new PublicService(
        prisma,
        { getPublicUrl: (key: string) => key } as any,
        {
          getSimpleItemStockState: jest.fn(),
          getItemSellability,
          getItemsSellabilityBulk,
        } as any,
        {
          resolveSelectionsForOrderLine,
        } as any,
      ),
      prisma,
      getItemSellability,
      getItemsSellabilityBulk,
      resolveSelectionsForOrderLine,
    };
  }

  it('persists excluded optional ingredient ids on public order items', async () => {
    const { service, prisma } = createService();

    await service.createOrder('demo', {
      customerName: 'Customer',
      customerWhatsapp: '573001112233',
      items: [
        {
          itemId: 'item-1',
          quantity: 1,
          excludedOptionalIngredientIds: ['ingredient-optional'],
        },
      ],
    });

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: 'Burger: sin Mayonesa',
          items: {
            create: [
              expect.objectContaining({
                itemId: 'item-1',
                excludedOptionalIngredientIds: ['ingredient-optional'],
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects mandatory ingredient exclusions', async () => {
    const { service } = createService();

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [
          {
            itemId: 'item-1',
            quantity: 1,
            excludedOptionalIngredientIds: ['ingredient-required'],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects exclusions outside the item recipe', async () => {
    const { service } = createService();

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [
          {
            itemId: 'item-1',
            quantity: 1,
            excludedOptionalIngredientIds: ['ingredient-other'],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts repeated item ids as independent customized lines', async () => {
    const {
      service,
      prisma,
      getItemsSellabilityBulk,
      resolveSelectionsForOrderLine,
    } = createService([
      {
        ...baseItem,
        optionGroups: [{ id: 'group-1' }],
      },
    ]);
    resolveSelectionsForOrderLine
      .mockResolvedValueOnce({
        optionsTotal: new Prisma.Decimal(1000),
        snapshots: [{ optionNameSnapshot: 'Queso' }],
      })
      .mockResolvedValueOnce({
        optionsTotal: new Prisma.Decimal(2000),
        snapshots: [{ optionNameSnapshot: 'Tocineta' }],
      });

    await service.createOrder('demo', {
      customerName: 'Customer',
      customerWhatsapp: '573001112233',
      items: [
        {
          itemId: 'item-1',
          quantity: 1,
          optionSelections: [
            {
              groupId: 'group-1',
              optionId: 'option-cheese',
              action: 'SELECT',
            },
          ],
        },
        {
          itemId: 'item-1',
          quantity: 2,
          optionSelections: [
            {
              groupId: 'group-1',
              optionId: 'option-bacon',
              action: 'SELECT',
            },
          ],
        },
      ],
    });

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['item-1'] } }),
      }),
    );
    expect(resolveSelectionsForOrderLine).toHaveBeenCalledTimes(2);
    expect(getItemsSellabilityBulk).toHaveBeenCalledWith(business.id, [
      { itemId: 'item-1', quantity: 1 },
      { itemId: 'item-1', quantity: 2 },
    ]);
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                itemId: 'item-1',
                quantity: 1,
                unitPrice: new Prisma.Decimal(11000),
                lineTotal: new Prisma.Decimal(11000),
                options: {
                  create: [{ optionNameSnapshot: 'Queso' }],
                },
              }),
              expect.objectContaining({
                itemId: 'item-1',
                quantity: 2,
                unitPrice: new Prisma.Decimal(12000),
                lineTotal: new Prisma.Decimal(24000),
                options: {
                  create: [{ optionNameSnapshot: 'Tocineta' }],
                },
              }),
            ],
          },
        }),
      }),
    );
  });

  it('accepts repeated item ids with identical options without consolidating lines', async () => {
    const { service, prisma, resolveSelectionsForOrderLine } = createService([
      {
        ...baseItem,
        optionGroups: [{ id: 'group-1' }],
      },
    ]);
    resolveSelectionsForOrderLine.mockResolvedValue({
      optionsTotal: new Prisma.Decimal(1000),
      snapshots: [{ optionNameSnapshot: 'Queso' }],
    });
    const selection = [
      {
        groupId: 'group-1',
        optionId: 'option-cheese',
        action: 'SELECT' as const,
      },
    ];

    await service.createOrder('demo', {
      customerName: 'Customer',
      customerWhatsapp: '573001112233',
      items: [
        { itemId: 'item-1', quantity: 1, optionSelections: selection },
        { itemId: 'item-1', quantity: 1, optionSelections: selection },
      ],
    });

    const createData = prisma.order.create.mock.calls[0][0].data.items.create;
    expect(createData).toHaveLength(2);
    expect(createData[0].itemId).toBe('item-1');
    expect(createData[1].itemId).toBe('item-1');
    expect(resolveSelectionsForOrderLine).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown item id', async () => {
    const { service, prisma } = createService([]);

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [{ itemId: 'missing-item', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive item', async () => {
    const { service, prisma } = createService([
      { ...baseItem, status: 'INACTIVE' },
    ]);

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [{ itemId: 'item-1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects the whole order when one line has an invalid option', async () => {
    const { service, prisma, resolveSelectionsForOrderLine } = createService([
      {
        ...baseItem,
        optionGroups: [{ id: 'group-1' }],
      },
    ]);
    resolveSelectionsForOrderLine
      .mockResolvedValueOnce({
        optionsTotal: new Prisma.Decimal(0),
        snapshots: [],
      })
      .mockRejectedValueOnce(new BadRequestException('Invalid option'));

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [
          { itemId: 'item-1', quantity: 1 },
          {
            itemId: 'item-1',
            quantity: 1,
            optionSelections: [
              {
                groupId: 'group-1',
                optionId: 'invalid-option',
                action: 'SELECT',
              },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects quantity %s', async (quantity) => {
    const { service, prisma } = createService();

    await expect(
      service.createOrder('demo', {
        customerName: 'Customer',
        customerWhatsapp: '573001112233',
        items: [{ itemId: 'item-1', quantity }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.item.findMany).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('loads public item and option sellability in one bulk call', async () => {
    const catalogItem = {
      ...baseItem,
      images: [],
      recipes: [
        {
          ...baseItem.recipes[0],
          quantityRequired: new Prisma.Decimal(1),
        },
      ],
      optionGroups: [
        {
          id: 'group-1',
          title: 'Extras',
          description: null,
          required: false,
          minSelections: 0,
          maxSelections: 1,
          quantityMode: 'FIXED_PER_OPTION',
          totalQuantityLimit: null,
          totalQuantityUnitId: null,
          totalQuantityUnit: null,
          sortOrder: 0,
          options: [
            {
              id: 'option-1',
              groupId: 'group-1',
              name: 'Extra burger',
              description: null,
              targetType: 'ITEM',
              ingredientId: null,
              itemId: 'item-2',
              quantity: new Prisma.Decimal(2),
              unitId: null,
              priceDelta: new Prisma.Decimal(5000),
              selectedByDefault: false,
              removable: true,
              sortOrder: 0,
              ingredient: null,
              item: {
                id: 'item-2',
                name: 'Extra',
                type: 'PRODUCT',
                inventoryMode: 'SIMPLE',
              },
              unit: null,
            },
          ],
        },
      ],
    };
    const { service, getItemSellability, getItemsSellabilityBulk } =
      createService([catalogItem]);

    const result = await service.listPublicItems('demo');

    expect(getItemsSellabilityBulk).toHaveBeenCalledTimes(1);
    expect(getItemsSellabilityBulk).toHaveBeenCalledWith(business.id, [
      'item-1',
      { itemId: 'item-2', quantity: 2 },
    ]);
    expect(getItemSellability).not.toHaveBeenCalled();
    expect(result.data[0].optionGroups[0].options[0].hasStock).toBe(true);
  });

  it('marks an item-target option without stock as unavailable', async () => {
    const catalogItem = {
      ...baseItem,
      images: [],
      recipes: [],
      optionGroups: [
        {
          id: 'group-1',
          isActive: true,
          title: 'Extras',
          quantityMode: 'FIXED_PER_OPTION',
          options: [
            {
              id: 'option-1',
              isActive: true,
              groupId: 'group-1',
              name: 'Extra',
              targetType: 'ITEM',
              itemId: 'item-2',
              quantity: new Prisma.Decimal(1),
              priceDelta: new Prisma.Decimal(0),
            },
          ],
        },
      ],
    };
    const { service, getItemsSellabilityBulk } = createService([catalogItem]);
    getItemsSellabilityBulk.mockResolvedValueOnce([
      { sellable: true, status: 'SELLABLE' },
      { sellable: false, status: 'NO_STOCK' },
    ]);

    const result = await service.listPublicItems('demo');

    expect(result.data[0].optionGroups[0].options[0].hasStock).toBe(false);
  });

  it('marks an ingredient-target option without stock as unavailable', async () => {
    const catalogItem = {
      ...baseItem,
      images: [],
      recipes: [],
      optionGroups: [
        {
          id: 'group-1',
          isActive: true,
          title: 'Extras',
          quantityMode: 'FIXED_PER_OPTION',
          options: [
            {
              id: 'option-1',
              isActive: true,
              groupId: 'group-1',
              name: 'Cheese',
              targetType: 'INGREDIENT',
              ingredientId: 'ingredient-cheese',
              ingredient: {
                id: 'ingredient-cheese',
                name: 'Cheese',
                currentStock: new Prisma.Decimal(0),
              },
              quantity: new Prisma.Decimal(1),
              priceDelta: new Prisma.Decimal(0),
            },
          ],
        },
      ],
    };
    const { service } = createService([catalogItem]);

    const result = await service.listPublicItems('demo');

    expect(result.data[0].optionGroups[0].options[0].hasStock).toBe(false);
  });

  it('does not expose inactive option groups or options', async () => {
    const catalogItem = {
      ...baseItem,
      images: [],
      recipes: [],
      optionGroups: [
        {
          id: 'inactive-group',
          isActive: false,
          title: 'Hidden',
          quantityMode: 'FIXED_PER_OPTION',
          options: [],
        },
        {
          id: 'active-group',
          isActive: true,
          title: 'Visible',
          quantityMode: 'FIXED_PER_OPTION',
          options: [
            {
              id: 'inactive-option',
              isActive: false,
              groupId: 'active-group',
              name: 'Hidden option',
              targetType: 'NONE',
              priceDelta: new Prisma.Decimal(0),
            },
            {
              id: 'active-option',
              isActive: true,
              groupId: 'active-group',
              name: 'Visible option',
              targetType: 'NONE',
              priceDelta: new Prisma.Decimal(0),
            },
          ],
        },
      ],
    };
    const { service } = createService([catalogItem]);

    const result = await service.listPublicItems('demo');

    expect(result.data[0].optionGroups).toHaveLength(1);
    expect(result.data[0].optionGroups[0].id).toBe('active-group');
    expect(result.data[0].optionGroups[0].options).toHaveLength(1);
    expect(result.data[0].optionGroups[0].options[0].id).toBe('active-option');
  });

  it('keeps public products without customization working', async () => {
    const { service } = createService([
      { ...baseItem, images: [], optionGroups: [] } as any,
    ]);

    const result = await service.listPublicItems('demo');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].optionGroups).toEqual([]);
  });
});
