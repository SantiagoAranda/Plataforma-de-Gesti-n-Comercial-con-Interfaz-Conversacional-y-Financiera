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
      inventoryMode: 'RECIPE_BASED',
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
    ).rejects.toThrow('Ya existe una opción con ese nombre dentro de este grupo.');
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
});
