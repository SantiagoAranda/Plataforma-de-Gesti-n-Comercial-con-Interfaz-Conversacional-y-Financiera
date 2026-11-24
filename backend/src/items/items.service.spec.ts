import { ItemsService } from './items.service';

describe('ItemsService', () => {
  it('should be defined', () => {
    const service = new ItemsService({} as any, {} as any, {} as any);
    expect(service).toBeDefined();
  });

  it('includes saleConcept in lightweight listings used by Mi Negocio editing', async () => {
    const prisma = {
      item: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const inventoryService = {
      getItemsSellabilityBulk: jest.fn().mockResolvedValue([]),
    };
    const service = new ItemsService(
      prisma as any,
      { getPublicUrl: jest.fn() } as any,
      inventoryService as any,
    );

    await service.findAll('business-1', 'ACTIVE', true);

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          saleConcept: true,
        }),
      }),
    );
  });

  it('deletes through an inactive status without inventory writes', async () => {
    const prisma = {
      item: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item-1' }),
        update: jest.fn().mockResolvedValue({ id: 'item-1', status: 'INACTIVE' }),
        delete: jest.fn(),
      },
      inventoryMovement: { delete: jest.fn(), deleteMany: jest.fn() },
    };
    const service = new ItemsService(
      prisma as any,
      { getPublicUrl: jest.fn() } as any,
      {} as any,
    );

    await service.setStatus('business-1', 'item-1', 'INACTIVE' as any);
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'INACTIVE' },
    });
    expect(prisma.item.delete).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.delete).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.deleteMany).not.toHaveBeenCalled();

    await service.remove('business-1', 'item-1');
    expect(prisma.item.update).toHaveBeenLastCalledWith({
      where: { id: 'item-1' },
      data: { status: 'INACTIVE' },
    });

  });

  describe('F1.1 catalog attributes', () => {
    const existingService = {
      id: 'svc-1',
      businessId: 'business-1',
      type: 'SERVICE',
      inventoryMode: 'NONE',
      durationMinutes: 45,
      badgeText: null,
      badgeColor: null,
    };

    function setup(existing: any = existingService) {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        item: {
          findFirst: jest.fn().mockResolvedValue(existing),
          update: jest.fn().mockResolvedValue({}),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...existing,
            images: [],
            scheduleWindows: [],
          }),
        },
        serviceScheduleWindow: { deleteMany: jest.fn(), createMany: jest.fn() },
        inventoryMovement: { create: jest.fn(), createMany: jest.fn() },
      };
      const prisma = {
        item: {
          findFirst: jest.fn().mockResolvedValue(existing),
          findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: jest.fn((fn: any) => fn(tx)),
      };
      const inventoryService = {
        getItemsSellabilityBulk: jest.fn().mockResolvedValue([]),
      };
      const service = new ItemsService(
        prisma as any,
        { getPublicUrl: jest.fn() } as any,
        inventoryService as any,
      );
      return { service, prisma, tx, inventoryService };
    }

    it('updates only the sent visibility flag: price, duration, schedule and stock untouched', async () => {
      const { service, tx } = setup();

      await service.update('business-1', 'svc-1', { visibleInCatalog: false } as any);

      const data = tx.item.update.mock.calls[0][0].data;
      expect(data.visibleInCatalog).toBe(false);
      for (const key of [
        'price',
        'durationMinutes',
        'name',
        'description',
        'publishWithoutPrice',
        'quotationDescription',
        'barcode',
        'categoryId',
        'subcategoryId',
        'minStock',
        'type',
        'status',
      ]) {
        expect(data[key]).toBeUndefined();
      }
      expect(tx.serviceScheduleWindow.deleteMany).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
    });

    it('hides the public price without touching the internal one', async () => {
      const { service, tx } = setup();
      await service.update('business-1', 'svc-1', { publishWithoutPrice: true } as any);
      const data = tx.item.update.mock.calls[0][0].data;
      expect(data.publishWithoutPrice).toBe(true);
      expect(data.price).toBeUndefined();
    });

    it('rejects an invalid category before opening a transaction', async () => {
      const { service, prisma } = setup();
      await expect(
        service.update('business-1', 'svc-1', {
          categoryId: 'mascotas',
          subcategoryId: 'moda-hombre/pantalones-y-jeans',
        } as any),
      ).rejects.toThrow('La subcategoría no pertenece');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scopes updates to the caller business', async () => {
      const { service, tx } = setup(null);
      await expect(
        service.update('other-business', 'svc-1', { brand: 'X' } as any),
      ).rejects.toThrow('Item not found');
      expect(tx.item.findFirst).toHaveBeenCalledWith({
        where: { id: 'svc-1', businessId: 'other-business' },
      });
    });

    it('persists normalized attributes on create', async () => {
      const { service, tx } = setup();
      (tx.item as any).create = jest.fn().mockResolvedValue({ id: 'new-1' });

      await service.create('business-1', {
        type: 'PRODUCT',
        name: 'Hamburguesa',
        price: 18000,
        publishWithoutPrice: true,
        barcode: '0770030467534',
        brand: '  ',
        categoryId: 'otra',
        customCategoryName: 'Repuestos',
      } as any);

      expect((tx.item as any).create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          price: 18000,
          publishWithoutPrice: true,
          visibleInCatalog: undefined,
          barcode: '0770030467534',
          brand: null,
          categoryId: 'otra',
          subcategoryId: null,
          customCategoryName: 'Repuestos',
          customSubcategoryName: null,
        }),
      });
    });

    it('filters hidden items only for the public-store context', async () => {
      const { service, prisma } = setup();

      await service.findAll('business-1', 'ACTIVE', true, 'public-store');
      expect(prisma.item.findMany.mock.calls[0][0].where).toEqual({
        businessId: 'business-1',
        status: 'ACTIVE',
        visibleInCatalog: true,
      });

      await service.findAll('business-1', 'ACTIVE', true, 'sales');
      expect(prisma.item.findMany.mock.calls[1][0].where).toEqual({
        businessId: 'business-1',
        status: 'ACTIVE',
      });
      expect(prisma.item.findMany.mock.calls[1][0].select).toMatchObject({
        visibleInCatalog: true,
        publishWithoutPrice: true,
        quotationDescription: true,
        barcode: true,
        categoryId: true,
      });
    });
  });
});
