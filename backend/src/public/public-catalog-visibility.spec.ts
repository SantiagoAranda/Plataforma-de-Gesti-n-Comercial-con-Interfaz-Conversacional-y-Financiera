import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PublicService } from './public.service';

// F1.1: hidden prices and hidden catalog items must never leak through public endpoints.
describe('PublicService catalog visibility (F1.1)', () => {
  const business = { id: 'business-1', slug: 'demo', status: 'ACTIVE' };
  const mockFn = () => jest.fn() as any;

  const hiddenPriceItem = {
    id: 'item-hidden-price',
    businessId: business.id,
    name: 'Mueble a medida',
    type: 'PRODUCT',
    status: 'ACTIVE',
    price: new Prisma.Decimal(950000),
    publishWithoutPrice: true,
    visibleInCatalog: true,
    includeInQuotation: true,
    quotationDescription: 'Texto interno de cotización',
    barcode: '0770030467534',
    brand: 'Casa',
    categoryId: 'hogar-y-muebles',
    subcategoryId: null,
    customCategoryName: null,
    customSubcategoryName: null,
    currentStock: new Prisma.Decimal(3),
    averageCost: new Prisma.Decimal(500000),
    durationMinutes: null,
    inventoryMode: 'NONE',
    images: [],
    recipes: [],
    optionGroups: [],
  };
  const pricedItem = {
    ...hiddenPriceItem,
    id: 'item-priced',
    publishWithoutPrice: false,
    price: new Prisma.Decimal(10000),
  };

  function createService(overrides: { itemFindMany?: any; tx?: any } = {}) {
    const calculateTaxPreview = mockFn().mockResolvedValue({ subtotal: 1 });
    const reserveSlot = mockFn().mockRejectedValue(new Error('reached reserveSlot'));
    const prisma: any = {
      business: { findFirst: mockFn().mockResolvedValue(business) },
      item: {
        findMany: overrides.itemFindMany ?? mockFn().mockResolvedValue([]),
        findFirst: mockFn().mockResolvedValue(null),
      },
      order: {
        findUnique: mockFn().mockResolvedValue(null),
        findFirst: mockFn().mockResolvedValue(null),
        create: mockFn(),
      },
      reservation: {
        findUnique: mockFn().mockResolvedValue(null),
        findMany: mockFn().mockResolvedValue([]),
      },
    };
    const tx = overrides.tx ?? {
      item: { findFirst: mockFn().mockResolvedValue(null) },
      reservation: { findUnique: mockFn().mockResolvedValue(null) },
    };
    prisma.$transaction = mockFn().mockImplementation((fn: any) => fn(tx));
    const service = new PublicService(
      prisma,
      { getPublicUrl: (key: string) => key } as any,
      {
        getItemsSellabilityBulk: mockFn().mockImplementation(
          (_b: string, requests: any[]) =>
            Promise.resolve(requests.map(() => ({ sellable: true }))),
        ),
      } as any,
      {
        resolveSelectionsForOrderLine: mockFn().mockResolvedValue({
          optionsTotal: new Prisma.Decimal(0),
          snapshots: [],
        }),
      } as any,
      undefined,
      { calculateTaxPreview } as any,
      undefined,
      { reserveSlot } as any,
    );
    return { service, prisma, tx, calculateTaxPreview, reserveSlot };
  }

  it('lists only catalog-visible items and masks hidden prices and internal fields', async () => {
    const { service, prisma } = createService({
      itemFindMany: mockFn().mockResolvedValue([hiddenPriceItem, pricedItem]),
    });

    const result = await service.listPublicItems('demo');

    expect(prisma.item.findMany.mock.calls[0][0].where).toMatchObject({
      businessId: business.id,
      status: 'ACTIVE',
      visibleInCatalog: true,
    });
    const [hidden, priced] = result.data as any[];
    expect(hidden.price).toBeNull();
    expect(hidden.publishWithoutPrice).toBe(true);
    expect(priced.price).toBe(10000);
    for (const view of result.data) {
      for (const key of [
        'barcode',
        'quotationDescription',
        'includeInQuotation',
        'visibleInCatalog',
        'currentStock',
        'averageCost',
      ]) {
        expect(view).not.toHaveProperty(key);
      }
    }
    expect(JSON.stringify(result)).not.toContain('950000');
  });

  it('rejects a direct public order containing a price-on-request line without creating it', async () => {
    const { service, prisma } = createService({
      itemFindMany: mockFn().mockResolvedValue([hiddenPriceItem, pricedItem]),
    });

    const attempt = service.createOrder('demo', {
      idempotencyKey: '00000000-0000-4000-8000-000000000101',
      customerName: 'Cliente',
      customerWhatsapp: '573001112233',
      items: [
        { itemId: 'item-hidden-price', quantity: 2 },
        { itemId: 'item-priced', quantity: 1 },
      ],
    } as any);

    await expect(attempt).rejects.toMatchObject({
      response: { code: 'PRICE_ON_REQUEST', itemIds: ['item-hidden-price'] },
    });
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.item.findMany.mock.calls[0][0].where).toMatchObject({
      visibleInCatalog: true,
    });
  });

  it('refuses a public tax preview that would price a hidden line with Item.price', async () => {
    const { service, calculateTaxPreview } = createService({
      itemFindMany: mockFn().mockResolvedValue([
        { id: 'item-hidden-price', visibleInCatalog: true, publishWithoutPrice: true },
      ]),
    });

    await expect(
      service.calculateTaxPreview('demo', {
        cartItems: [{ itemId: 'item-hidden-price', quantity: 1 }],
      } as any),
    ).rejects.toMatchObject({ response: { code: 'PRICE_ON_REQUEST' } });
    expect(calculateTaxPreview).not.toHaveBeenCalled();
  });

  it('refuses a public tax preview for an item hidden from the catalog', async () => {
    const { service, calculateTaxPreview } = createService({
      itemFindMany: mockFn().mockResolvedValue([
        { id: 'item-x', visibleInCatalog: false, publishWithoutPrice: false },
      ]),
    });
    await expect(
      service.calculateTaxPreview('demo', {
        cartItems: [{ itemId: 'item-x', quantity: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(calculateTaxPreview).not.toHaveBeenCalled();
  });

  it('keeps the public tax preview unchanged for visible priced lines', async () => {
    const { service, calculateTaxPreview } = createService();
    const dto = { cartItems: [{ itemId: 'item-priced', quantity: 1 }] } as any;
    await expect(service.calculateTaxPreview('demo', dto)).resolves.toEqual({
      subtotal: 1,
    });
    expect(calculateTaxPreview).toHaveBeenCalledWith(business.id, dto);
  });

  const booking = {
    idempotencyKey: '00000000-0000-4000-8000-000000000201',
    itemId: 'svc-1',
    customerName: 'Cliente',
    customerWhatsapp: '573001112233',
    date: '2026-12-01',
    startMinute: 600,
    endMinute: 660,
  } as any;

  it('does not book a service hidden from the catalog', async () => {
    const tx = {
      item: { findFirst: mockFn().mockResolvedValue({ id: 'svc-1' }) },
      reservation: { findUnique: mockFn().mockResolvedValue(null) },
    };
    const { service, reserveSlot } = createService({ tx });

    await expect(service.createReservation('demo', booking)).rejects.toThrow(
      'Invalid service',
    );
    expect(reserveSlot).not.toHaveBeenCalled();
    expect(tx.item.findFirst.mock.calls[0][0].where).toEqual({
      id: 'svc-1',
      businessId: business.id,
      visibleInCatalog: false,
    });
  });

  it('lets a hidden-price service reach the normal booking flow', async () => {
    const { service, reserveSlot } = createService();
    await expect(service.createReservation('demo', booking)).rejects.toThrow(
      'reached reserveSlot',
    );
    expect(reserveSlot).toHaveBeenCalledTimes(1);
  });

  it('masks the price in the public reservation lookup', async () => {
    const { service, prisma } = createService();
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'CONFIRMED',
      archived: false,
      commercialPolicyVersion: 2,
      inventoryPostedAt: null,
      accountingPostedAt: null,
      customerName: 'Cliente',
      customerWhatsapp: '573001112233',
      date: new Date('2026-12-01T00:00:00Z'),
      startMinute: 600,
      endMinute: 660,
      note: null,
      item: {
        id: 'svc-1',
        name: 'Corte',
        price: new Prisma.Decimal(45000),
        publishWithoutPrice: true,
        durationMinutes: 60,
      },
      business: { id: business.id, name: 'Demo', slug: 'demo', phoneWhatsapp: null },
    });

    const result: any = await service.findReservationById('r1');

    expect(result.item.price).toBeNull();
    expect(JSON.stringify(result)).not.toContain('45000');
  });
});
