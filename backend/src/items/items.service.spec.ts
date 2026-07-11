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
});
