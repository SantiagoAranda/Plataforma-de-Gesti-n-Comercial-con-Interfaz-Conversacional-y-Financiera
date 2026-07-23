import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { ItemOptionsService } from './item-options.service';
import { ItemOptionTargetType, ItemOptionQuantityMode } from '@prisma/client';

describe('ItemOptionsService Duplicates Validation', () => {
  const businessId = 'business-1';
  const itemId = 'item-1';
  const groupId = 'group-1';
  const mockFn = () => jest.fn() as any;

  function createService(options: {
    existingOptions?: any[];
    existingGroup?: any;
    existingItem?: any;
    existingIngredient?: any;
    usedCount?: number;
  } = {}) {
    const existingOptions = options.existingOptions ?? [];
    const group = options.existingGroup ?? {
      id: groupId,
      businessId,
      itemId,
      title: 'Elige tu carne principal',
      quantityMode: ItemOptionQuantityMode.FIXED_PER_OPTION,
      totalQuantityUnitId: null,
      isActive: true,
      options: [],
    };
    const item = options.existingItem ?? {
      id: itemId,
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      status: 'ACTIVE',
    };
    const ingredient = options.existingIngredient ?? {
      id: 'ingredient-1',
      businessId,
      stockUnitId: 'unit-g',
    };

    const prisma = {
      item: {
        findFirst: mockFn().mockResolvedValue(item),
      },
      itemOptionGroup: {
        findFirst: mockFn().mockResolvedValue(group),
        create: mockFn().mockImplementation(async (query: any) => ({ id: 'new-group', options: [], ...query.data })),
        update: mockFn().mockImplementation(async (query: any) => ({ ...group, options: [], ...query.data })),
        delete: mockFn().mockResolvedValue(group),
        findUniqueOrThrow: mockFn().mockResolvedValue({
          ...group,
          options: existingOptions.filter(o => o.groupId === group.id && o.isActive),
        }),
      },
      itemOption: {
        findFirst: mockFn().mockImplementation(async (query: any) => {
          const { where } = query;
          return existingOptions.find((o) => {
            if (where.id !== undefined) {
              if (typeof where.id === 'string') {
                if (o.id !== where.id) return false;
              } else if (where.id.not !== undefined) {
                if (o.id === where.id.not) return false;
              }
            }
            if (where.groupId !== undefined && o.groupId !== where.groupId) return false;
            if (where.businessId !== undefined && o.businessId !== where.businessId) return false;
            if (where.isActive !== undefined && o.isActive !== where.isActive) return false;
            
            if (where.targetType !== undefined) {
              if (where.targetType === ItemOptionTargetType.INGREDIENT) {
                return o.targetType === ItemOptionTargetType.INGREDIENT && o.ingredientId === where.ingredientId;
              }
              if (where.targetType === ItemOptionTargetType.ITEM) {
                return o.targetType === ItemOptionTargetType.ITEM && o.itemId === where.itemId;
              }
              return false;
            }
            return true;
          }) || null;
        }),
        findMany: mockFn().mockImplementation(async (query: any) => {
          const { where } = query;
          return existingOptions.filter((o) => {
            if (where.groupId !== o.groupId) return false;
            if (where.isActive !== undefined && where.isActive !== o.isActive) return false;
            if (where.targetType !== undefined && where.targetType !== o.targetType) return false;
            if (where.id?.not === o.id) return false;
            return true;
          });
        }),
        create: mockFn().mockImplementation(async (query: any) => {
          return { id: 'new-option', ...query.data };
        }),
        update: mockFn().mockImplementation(async (query: any) => {
          return { id: query.where.id, ...query.data };
        }),
        delete: mockFn().mockResolvedValue({ id: 'deleted-option' }),
      },
      orderItemOption: {
        count: mockFn().mockResolvedValue(options.usedCount ?? 0),
      },
      ingredient: {
        findFirst: mockFn().mockResolvedValue(ingredient),
      },
      unit: {
        findFirst: mockFn().mockResolvedValue({ id: 'unit-g', isActive: true }),
      },
    } as any;

    return { service: new ItemOptionsService(prisma), prisma };
  }

  // 1. Crear dos opciones activas con mismo ingredientId en el mismo grupo debe fallar.
  it('fails when creating duplicate active ingredient option in the same group', async () => {
    const { service } = createService({
      existingOptions: [
        {
          id: 'opt-existing',
          groupId,
          targetType: ItemOptionTargetType.INGREDIENT,
          ingredientId: 'ingredient-1',
          isActive: true,
          name: 'Cerdo',
        },
      ],
    });

    await expect(
      service.createOption(businessId, itemId, groupId, {
        name: 'Cerdo Duplicado',
        targetType: ItemOptionTargetType.INGREDIENT,
        ingredientId: 'ingredient-1',
        quantity: 100,
        isActive: true,
      }),
    ).rejects.toThrow('Este insumo ya existe como opción activa dentro de este grupo.');
  });

  // 2. Crear dos opciones activas con mismo ingredientId en grupos distintos debe funcionar.
  it('succeeds when creating ingredient options with same ingredientId in different groups', async () => {
    const { service, prisma } = createService({
      existingOptions: [
        {
          id: 'opt-existing',
          groupId: 'other-group',
          targetType: ItemOptionTargetType.INGREDIENT,
          ingredientId: 'ingredient-1',
          isActive: true,
          name: 'Cerdo',
        },
      ],
    });

    const res = await service.createOption(businessId, itemId, groupId, {
      name: 'Cerdo Principal',
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      quantity: 100,
      isActive: true,
    });
    expect(res).toBeDefined();
    expect(prisma.itemOption.create).toHaveBeenCalled();
  });

  // 3. Crear dos opciones activas con mismo itemId en el mismo grupo debe fallar.
  it('fails when creating duplicate active item option in the same group', async () => {
    const targetItem = {
      id: 'target-item-id',
      businessId,
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
      status: 'ACTIVE',
    };
    const { service } = createService({
      existingItem: targetItem,
      existingOptions: [
        {
          id: 'opt-existing',
          groupId,
          targetType: ItemOptionTargetType.ITEM,
          itemId: 'target-item-id',
          isActive: true,
          name: 'Arepa',
        },
      ],
    });

    await expect(
      service.createOption(businessId, itemId, groupId, {
        name: 'Arepa Duplicada',
        targetType: ItemOptionTargetType.ITEM,
        itemId: 'target-item-id',
        quantity: 1,
        unitId: 'unit-g',
        isActive: true,
      }),
    ).rejects.toThrow('Este producto ya existe como opción activa dentro de este grupo.');
  });

  // 4. Crear dos opciones NONE con mismo nombre normalizado en el mismo grupo debe fallar.
  it('fails when creating NONE options with duplicate normalized name in the same group', async () => {
    const { service } = createService({
      existingOptions: [
        {
          id: 'opt-existing',
          groupId,
          targetType: ItemOptionTargetType.NONE,
          isActive: true,
          name: '  Salsa   Especial  ',
        },
      ],
    });

    await expect(
      service.createOption(businessId, itemId, groupId, {
        name: 'salsa especial',
        targetType: ItemOptionTargetType.NONE,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 5. Editar una opción sin cambiar su propio ingredientId no debe detectarse como duplicado de sí misma.
  it('allows updating an option without flagging it as a duplicate of itself', async () => {
    const existingOpt = {
      id: 'opt-1',
      groupId,
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      isActive: true,
      name: 'Cerdo',
      businessId,
      quantity: 100,
    };
    const { service, prisma } = createService({
      existingOptions: [existingOpt],
    });

    const res = await service.updateOption(businessId, itemId, groupId, 'opt-1', {
      name: 'Cerdo Renovado',
      quantity: 150,
    });
    expect(res).toBeDefined();
    expect(prisma.itemOption.update).toHaveBeenCalled();
  });

  // 6. Reactivar una opción inactiva debe fallar si ya existe otra activa con el mismo ingredientId en el grupo.
  it('fails when reactivating an inactive option if an active option with the same ingredientId exists', async () => {
    const inactiveOpt = {
      id: 'opt-inactive',
      groupId,
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      isActive: false,
      name: 'Cerdo Viejo',
      businessId,
      quantity: 100,
    };
    const activeOpt = {
      id: 'opt-active',
      groupId,
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      isActive: true,
      name: 'Cerdo Nuevo',
      businessId,
      quantity: 100,
    };

    const { service } = createService({
      existingOptions: [inactiveOpt, activeOpt],
    });

    await expect(
      service.updateOption(businessId, itemId, groupId, 'opt-inactive', {
        isActive: true,
      }),
    ).rejects.toThrow('Este insumo ya existe como opción activa dentro de este grupo.');
  });

  // 7. Opción inactiva duplicada no debe bloquear creación de una nueva activa.
  it('allows creating an active option even if there is an inactive duplicate', async () => {
    const inactiveOpt = {
      id: 'opt-inactive',
      groupId,
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      isActive: false,
      name: 'Cerdo',
    };

    const { service, prisma } = createService({
      existingOptions: [inactiveOpt],
    });

    const res = await service.createOption(businessId, itemId, groupId, {
      name: 'Cerdo Activo',
      targetType: ItemOptionTargetType.INGREDIENT,
      ingredientId: 'ingredient-1',
      quantity: 100,
      isActive: true,
    });
    expect(res).toBeDefined();
    expect(prisma.itemOption.create).toHaveBeenCalled();
  });

  it('allows FIXED_PER_OPTION groups and rejects new NO_QUANTITY groups', async () => {
    const { service } = createService();
    await expect(service.createGroup(businessId, itemId, {
      title: 'Extras', quantityMode: ItemOptionQuantityMode.FIXED_PER_OPTION,
    })).resolves.toBeDefined();
    await expect(service.createGroup(businessId, itemId, {
      title: 'Legacy', quantityMode: ItemOptionQuantityMode.NO_QUANTITY,
    })).rejects.toThrow('Los grupos nuevos deben controlar consumo de inventario.');
  });

  it('allows a non-structural update on a historical NO_QUANTITY group', async () => {
    const { service } = createService({ existingGroup: {
      id: groupId, businessId, itemId, title: 'Legacy', quantityMode: ItemOptionQuantityMode.NO_QUANTITY,
      totalQuantityLimit: null, totalQuantityUnitId: null, options: [],
    }});
    await expect(service.updateGroup(businessId, itemId, groupId, {
      title: 'Legacy actualizado',
    })).resolves.toBeDefined();
  });

  it('rejects a FIXED_PER_OPTION group change to NO_QUANTITY', async () => {
    const { service } = createService();
    await expect(service.updateGroup(businessId, itemId, groupId, {
      quantityMode: ItemOptionQuantityMode.NO_QUANTITY,
    })).rejects.toThrow('Los grupos nuevos deben controlar consumo de inventario.');
  });
  it('deletes an unused option and deactivates an option with order history', async () => {
    const unused = createService({ existingOptions: [{ id: 'option-1', groupId, businessId }] });
    await expect(unused.service.deleteOption(businessId, itemId, groupId, 'option-1')).resolves.toMatchObject({ deleted: true });
    expect(unused.prisma.itemOption.delete).toHaveBeenCalled();

    const used = createService({ usedCount: 1, existingOptions: [{ id: 'option-1', groupId, businessId }] });
    await expect(used.service.deleteOption(businessId, itemId, groupId, 'option-1')).resolves.toMatchObject({ deactivated: true });
    expect(used.prisma.itemOption.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });

  it('deletes an unused group and deactivates a group with history', async () => {
    const unused = createService();
    await expect(unused.service.deleteGroup(businessId, itemId, groupId)).resolves.toMatchObject({ deleted: true });
    expect(unused.prisma.itemOptionGroup.delete).toHaveBeenCalledWith({ where: { id: groupId } });

    const used = createService({ usedCount: 1 });
    await expect(used.service.deleteGroup(businessId, itemId, groupId)).resolves.toMatchObject({ deactivated: true });
    expect(used.prisma.itemOptionGroup.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });
});
