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
    price: new Prisma.Decimal(10000),
    durationMinutes: null,
    inventoryMode: 'RECIPE_BASED',
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
      service: new PublicService(prisma, { getPublicUrl: (key: string) => key } as any),
      prisma,
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

    expect(prisma.order.create).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
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
});
