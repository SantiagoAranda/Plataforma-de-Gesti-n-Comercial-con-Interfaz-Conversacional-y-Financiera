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
});
