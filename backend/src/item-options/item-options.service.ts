import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMode,
  ItemOptionQuantityMode,
  ItemOptionTargetType,
  OrderItemOptionAction,
  ItemType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';
import { CreateItemOptionDto } from './dto/create-item-option.dto';
import { UpdateItemOptionDto } from './dto/update-item-option.dto';

export type OptionSelectionActionInput = {
  groupId: string;
  optionId: string;
  action: OrderItemOptionAction | 'SELECT' | 'ADD' | 'REMOVE';
};

@Injectable()
export class ItemOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSelectionsForOrderLine(
    businessId: string,
    itemId: string,
    quantity: number,
    optionSelections: OptionSelectionActionInput[] = [],
  ) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    this.validateSelectionActions(optionSelections);

    const groups = await this.prisma.itemOptionGroup.findMany({
      where: { businessId, itemId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        totalQuantityUnit: true,
        options: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: this.optionInclude(),
        },
      },
    });

    if (!groups.length) {
      if (optionSelections.length > 0) {
        throw new BadRequestException('Item does not have option groups');
      }
      return {
        optionsTotal: new Prisma.Decimal(0),
        snapshots: [] as Prisma.OrderItemOptionCreateWithoutOrderItemInput[],
      };
    }

    const groupById = new Map(groups.map((group) => [group.id, group]));
    const optionById = new Map(
      groups.flatMap((group) =>
        group.options.map((option) => [option.id, { group, option }] as const),
      ),
    );

    const selectedByGroup = new Map<string, Map<string, {
      option: any;
      action: OrderItemOptionAction;
    }>>();

    for (const group of groups) {
      const selected = new Map<string, {
        option: any;
        action: OrderItemOptionAction;
      }>();
      for (const option of group.options) {
        if (option.selectedByDefault) {
          selected.set(option.id, {
            option,
            action: OrderItemOptionAction.SELECT,
          });
        }
      }
      selectedByGroup.set(group.id, selected);
    }

    for (const selection of optionSelections) {
      const group = groupById.get(selection.groupId);
      const resolved = optionById.get(selection.optionId);
      if (!group || !resolved || resolved.group.id !== selection.groupId) {
        throw new BadRequestException('optionSelections contains an invalid option');
      }

      const selected = selectedByGroup.get(group.id)!;
      const action = selection.action as OrderItemOptionAction;

      if (
        action === OrderItemOptionAction.SELECT ||
        action === OrderItemOptionAction.ADD
      ) {
        selected.set(resolved.option.id, { option: resolved.option, action });
        continue;
      }

      if (action === OrderItemOptionAction.REMOVE) {
        if (!resolved.option.selectedByDefault || !resolved.option.removable) {
          throw new BadRequestException(
            'REMOVE only applies to removable selectedByDefault options',
          );
        }
        selected.delete(resolved.option.id);
      }
    }

    let optionsTotal = new Prisma.Decimal(0);
    const snapshots: Prisma.OrderItemOptionCreateWithoutOrderItemInput[] = [];

    for (const group of groups) {
      const selected = Array.from(selectedByGroup.get(group.id)!.values());
      const minSelections = Math.max(
        group.required ? 1 : 0,
        group.minSelections,
      );

      if (selected.length < minSelections) {
        throw new BadRequestException(
          `Option group "${group.title}" requires at least ${minSelections} selection(s)`,
        );
      }
      if (group.maxSelections != null && selected.length > group.maxSelections) {
        throw new BadRequestException(
          `Option group "${group.title}" allows at most ${group.maxSelections} selection(s)`,
        );
      }

      if (group.quantityMode === ItemOptionQuantityMode.SHARED_TOTAL) {
        if (!group.totalQuantityLimit || !group.totalQuantityUnitId) {
          throw new BadRequestException(
            `Option group "${group.title}" has invalid shared quantity settings`,
          );
        }
        const consuming = selected.filter(
          ({ option }) => option.targetType === ItemOptionTargetType.INGREDIENT,
        );
        if (consuming.length !== selected.length || consuming.length === 0) {
          throw new BadRequestException(
            `Option group "${group.title}" must select ingredient options`,
          );
        }
        const quantityPerUnit = this.decimal(group.totalQuantityLimit, 'totalQuantityLimit')
          .div(consuming.length);

        for (const { option, action } of consuming) {
          const totalQuantity = quantityPerUnit.mul(quantity);
          optionsTotal = optionsTotal.add(this.decimal(option.priceDelta, 'priceDelta'));
          snapshots.push(
            this.buildOptionSnapshot({
              group,
              option,
              action,
              quantityPerUnit,
              totalQuantity,
              unitId: group.totalQuantityUnitId,
              unitLabel: group.totalQuantityUnit?.symbol ?? group.totalQuantityUnit?.name ?? null,
            }),
          );
        }
        continue;
      }

      for (const { option, action } of selected) {
        let quantityPerUnit: Prisma.Decimal | null = null;
        let totalQuantity: Prisma.Decimal | null = null;
        let unitId: string | null = null;
        let unitLabel: string | null = null;

        if (group.quantityMode === ItemOptionQuantityMode.FIXED_PER_OPTION) {
          if (option.quantity != null) {
            quantityPerUnit = this.decimal(option.quantity, 'quantity');
            totalQuantity = quantityPerUnit.mul(quantity);
            unitId = option.unitId ?? null;
            unitLabel = option.unit?.symbol ?? option.unit?.name ?? null;
          }
        }

        optionsTotal = optionsTotal.add(this.decimal(option.priceDelta, 'priceDelta'));
        snapshots.push(
          this.buildOptionSnapshot({
            group,
            option,
            action,
            quantityPerUnit,
            totalQuantity,
            unitId,
            unitLabel,
          }),
        );
      }
    }

    return { optionsTotal, snapshots };
  }

  async listGroups(businessId: string, itemId: string) {
    await this.assertItem(businessId, itemId);

    const groups = await this.prisma.itemOptionGroup.findMany({
      where: { businessId, itemId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: this.groupInclude(),
    });

    return groups.map((group) => this.mapGroup(group));
  }

  async createGroup(
    businessId: string,
    itemId: string,
    dto: CreateOptionGroupDto,
  ) {
    await this.assertItem(businessId, itemId);
    await this.validateGroupDto(dto);

    const group = await this.prisma.itemOptionGroup.create({
      data: {
        businessId,
        itemId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        required: dto.required ?? false,
        minSelections: dto.minSelections ?? (dto.required ? 1 : 0),
        maxSelections: dto.maxSelections ?? null,
        quantityMode: dto.quantityMode,
        totalQuantityLimit:
          dto.totalQuantityLimit == null
            ? null
            : this.positiveDecimal(dto.totalQuantityLimit, 'totalQuantityLimit'),
        totalQuantityUnitId: dto.totalQuantityUnitId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: this.groupInclude(),
    });

    return this.mapGroup(group);
  }

  async updateGroup(
    businessId: string,
    itemId: string,
    groupId: string,
    dto: UpdateOptionGroupDto,
  ) {
    const existing = await this.assertGroup(businessId, itemId, groupId);
    const merged = {
      title: dto.title ?? existing.title,
      required: dto.required ?? existing.required,
      minSelections: dto.minSelections ?? existing.minSelections,
      maxSelections:
        dto.maxSelections === undefined
          ? existing.maxSelections
          : dto.maxSelections,
      quantityMode: dto.quantityMode ?? existing.quantityMode,
      totalQuantityLimit:
        dto.totalQuantityLimit === undefined
          ? existing.totalQuantityLimit
          : dto.totalQuantityLimit,
      totalQuantityUnitId:
        dto.totalQuantityUnitId === undefined
          ? existing.totalQuantityUnitId
          : dto.totalQuantityUnitId,
    };

    await this.validateGroupDto(merged);

    const group = await this.prisma.itemOptionGroup.update({
      where: { id: groupId },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined ? undefined : dto.description?.trim() || null,
        required: dto.required,
        minSelections: dto.minSelections,
        maxSelections: dto.maxSelections,
        quantityMode: dto.quantityMode,
        totalQuantityLimit:
          dto.totalQuantityLimit === undefined
            ? undefined
            : dto.totalQuantityLimit == null
              ? null
              : this.positiveDecimal(dto.totalQuantityLimit, 'totalQuantityLimit'),
        totalQuantityUnitId:
          dto.totalQuantityUnitId === undefined
            ? undefined
            : dto.totalQuantityUnitId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: this.groupInclude(),
    });

    await this.validateActiveDefaults(group.id);
    return this.mapGroup(group);
  }

  async deleteGroup(businessId: string, itemId: string, groupId: string) {
    await this.assertGroup(businessId, itemId, groupId);
    const used = await this.prisma.orderItemOption.count({
      where: { groupId },
    });

    if (used > 0) {
      await this.prisma.itemOptionGroup.update({
        where: { id: groupId },
        data: { isActive: false },
      });
      return { ok: true, deactivated: true };
    }

    await this.prisma.itemOptionGroup.delete({ where: { id: groupId } });
    return { ok: true, deleted: true };
  }

  async createOption(
    businessId: string,
    itemId: string,
    groupId: string,
    dto: CreateItemOptionDto,
  ) {
    const group = await this.assertGroup(businessId, itemId, groupId);
    const normalized = await this.validateOptionDto(businessId, group, dto);

    const option = await this.prisma.itemOption.create({
      data: {
        businessId,
        groupId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        targetType: normalized.targetType,
        ingredientId: normalized.ingredientId,
        itemId: normalized.itemId,
        quantity: normalized.quantity,
        unitId: normalized.unitId,
        priceDelta:
          dto.priceDelta == null
            ? new Prisma.Decimal(0)
            : this.decimal(dto.priceDelta, 'priceDelta'),
        selectedByDefault: dto.selectedByDefault ?? false,
        removable: dto.removable ?? true,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: this.optionInclude(),
    });

    await this.validateActiveDefaults(groupId);
    return this.mapOption(option);
  }

  async updateOption(
    businessId: string,
    itemId: string,
    groupId: string,
    optionId: string,
    dto: UpdateItemOptionDto,
  ) {
    const group = await this.assertGroup(businessId, itemId, groupId);
    const existing = await this.prisma.itemOption.findFirst({
      where: { id: optionId, businessId, groupId },
    });
    if (!existing) throw new NotFoundException('Option not found');

    const merged = {
      ...existing,
      ...dto,
      targetType: dto.targetType ?? existing.targetType,
      ingredientId:
        dto.ingredientId === undefined ? existing.ingredientId : dto.ingredientId,
      itemId: dto.itemId === undefined ? existing.itemId : dto.itemId,
      quantity: dto.quantity === undefined ? existing.quantity : dto.quantity,
      unitId: dto.unitId === undefined ? existing.unitId : dto.unitId,
    };
    const normalized = await this.validateOptionDto(businessId, group, merged, optionId);

    const option = await this.prisma.itemOption.update({
      where: { id: optionId },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined ? undefined : dto.description?.trim() || null,
        targetType: normalized.targetType,
        ingredientId: normalized.ingredientId,
        itemId: normalized.itemId,
        quantity: normalized.quantity,
        unitId: normalized.unitId,
        priceDelta:
          dto.priceDelta === undefined
            ? undefined
            : this.decimal(dto.priceDelta, 'priceDelta'),
        selectedByDefault: dto.selectedByDefault,
        removable: dto.removable,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: this.optionInclude(),
    });

    await this.validateActiveDefaults(groupId);
    return this.mapOption(option);
  }

  async deleteOption(
    businessId: string,
    itemId: string,
    groupId: string,
    optionId: string,
  ) {
    await this.assertGroup(businessId, itemId, groupId);
    const existing = await this.prisma.itemOption.findFirst({
      where: { id: optionId, businessId, groupId },
    });
    if (!existing) throw new NotFoundException('Option not found');

    const used = await this.prisma.orderItemOption.count({
      where: { optionId },
    });

    if (used > 0) {
      await this.prisma.itemOption.update({
        where: { id: optionId },
        data: { isActive: false },
      });
      return { ok: true, deactivated: true };
    }

    await this.prisma.itemOption.delete({ where: { id: optionId } });
    return { ok: true, deleted: true };
  }

  private async assertItem(businessId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, businessId },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item.type !== ItemType.PRODUCT) {
      throw new BadRequestException('Only PRODUCT items can have options');
    }
    return item;
  }

  private async assertGroup(
    businessId: string,
    itemId: string,
    groupId: string,
  ) {
    await this.assertItem(businessId, itemId);
    const group = await this.prisma.itemOptionGroup.findFirst({
      where: { id: groupId, businessId, itemId },
      include: this.groupInclude(),
    });
    if (!group) throw new NotFoundException('Option group not found');
    return group;
  }

  private async validateGroupDto(input: {
    title?: string;
    required?: boolean;
    minSelections?: number;
    maxSelections?: number | null;
    quantityMode?: ItemOptionQuantityMode;
    totalQuantityLimit?: string | number | Prisma.Decimal | null;
    totalQuantityUnitId?: string | null;
  }) {
    if (input.title !== undefined && input.title.trim().length === 0) {
      throw new BadRequestException('title is required');
    }

    const minSelections = input.minSelections ?? 0;
    const maxSelections = input.maxSelections ?? null;
    if (minSelections < 0) {
      throw new BadRequestException('minSelections must be >= 0');
    }
    if (maxSelections != null && maxSelections < 1) {
      throw new BadRequestException('maxSelections must be >= 1');
    }
    if (maxSelections != null && minSelections > maxSelections) {
      throw new BadRequestException('minSelections cannot exceed maxSelections');
    }
    if (input.required && minSelections < 1) {
      throw new BadRequestException('required groups must have minSelections >= 1');
    }

    if (input.quantityMode === ItemOptionQuantityMode.SHARED_TOTAL) {
      if (input.totalQuantityLimit == null) {
        throw new BadRequestException('SHARED_TOTAL requires totalQuantityLimit');
      }
      this.positiveDecimal(input.totalQuantityLimit, 'totalQuantityLimit');
      if (!input.totalQuantityUnitId) {
        throw new BadRequestException('SHARED_TOTAL requires totalQuantityUnitId');
      }
      await this.assertUnit(input.totalQuantityUnitId);
      return;
    }

    if (input.quantityMode === ItemOptionQuantityMode.NO_QUANTITY) {
      if (input.totalQuantityLimit != null || input.totalQuantityUnitId) {
        throw new BadRequestException('NO_QUANTITY cannot have total quantity fields');
      }
    }
  }

  private async validateOptionDto(
    businessId: string,
    group: {
      id: string;
      quantityMode: ItemOptionQuantityMode;
      totalQuantityUnitId: string | null;
    },
    input: {
      targetType?: ItemOptionTargetType;
      ingredientId?: string | null;
      itemId?: string | null;
      quantity?: string | number | Prisma.Decimal | null;
      unitId?: string | null;
      isActive?: boolean;
      name?: string;
    },
    optionId?: string,
  ): Promise<{
    targetType: ItemOptionTargetType;
    ingredientId: string | null;
    itemId: string | null;
    quantity: Prisma.Decimal | null;
    unitId: string | null;
  }> {
    const targetType = input.targetType ?? ItemOptionTargetType.NONE;
    let ingredientId: string | null = null;
    let itemId: string | null = null;
    let quantity: Prisma.Decimal | null = null;
    let unitId: string | null = null;

    if (targetType === ItemOptionTargetType.NONE) {
      if (input.ingredientId || input.itemId) {
        throw new BadRequestException('NONE options cannot target inventory');
      }
    }

    if (targetType === ItemOptionTargetType.INGREDIENT) {
      if (!input.ingredientId || input.itemId) {
        throw new BadRequestException('INGREDIENT options require ingredientId only');
      }
      const ingredient = await this.assertIngredient(businessId, input.ingredientId);
      ingredientId = ingredient.id;
      unitId = ingredient.stockUnitId;
    }

    if (targetType === ItemOptionTargetType.ITEM) {
      if (!input.itemId || input.ingredientId) {
        throw new BadRequestException('ITEM options require itemId only');
      }
      const targetItem = await this.assertTargetItem(businessId, input.itemId);
      if (
        targetItem.type !== ItemType.PRODUCT ||
        targetItem.inventoryMode === InventoryMode.NONE
      ) {
        throw new BadRequestException(
          'ITEM options must target PRODUCT items with inventory in this MVP',
        );
      }
      itemId = targetItem.id;
      unitId = input.unitId ?? null;
    }

    if (group.quantityMode === ItemOptionQuantityMode.NO_QUANTITY) {
      if (targetType !== ItemOptionTargetType.NONE) {
        throw new BadRequestException('NO_QUANTITY options must use targetType NONE');
      }
      if (input.quantity != null || input.unitId) {
        throw new BadRequestException('NO_QUANTITY options cannot have quantity or unitId');
      }
    }

    if (group.quantityMode === ItemOptionQuantityMode.SHARED_TOTAL) {
      if (targetType !== ItemOptionTargetType.INGREDIENT) {
        throw new BadRequestException('SHARED_TOTAL options must target INGREDIENT');
      }
      await this.assertIngredientCompatibleWithUnit(
        businessId,
        ingredientId!,
        group.totalQuantityUnitId,
      );
      // SHARED_TOTAL options always have null quantity
      quantity = null;
    }

    if (group.quantityMode === ItemOptionQuantityMode.FIXED_PER_OPTION) {
      if (targetType !== ItemOptionTargetType.NONE) {
        if (input.quantity == null) {
          throw new BadRequestException(
            'FIXED_PER_OPTION inventory options require quantity',
          );
        }
        quantity = this.positiveDecimal(input.quantity, 'quantity');
        
        if (targetType === ItemOptionTargetType.ITEM) {
          if (!unitId) {
            throw new BadRequestException(
              'FIXED_PER_OPTION ITEM options require unitId',
            );
          }
          await this.assertUnit(unitId);
        }
      }
    }

    const isActive = input.isActive ?? true;
    if (isActive) {
      if (targetType === ItemOptionTargetType.INGREDIENT && ingredientId) {
        const duplicate = await this.prisma.itemOption.findFirst({
          where: {
            groupId: group.id,
            targetType: ItemOptionTargetType.INGREDIENT,
            ingredientId: ingredientId,
            isActive: true,
            ...(optionId ? { id: { not: optionId } } : {}),
          },
        });
        if (duplicate) {
          throw new BadRequestException(
            'Este insumo ya existe como opción activa dentro de este grupo.',
          );
        }
      }

      if (targetType === ItemOptionTargetType.ITEM && itemId) {
        const duplicate = await this.prisma.itemOption.findFirst({
          where: {
            groupId: group.id,
            targetType: ItemOptionTargetType.ITEM,
            itemId: itemId,
            isActive: true,
            ...(optionId ? { id: { not: optionId } } : {}),
          },
        });
        if (duplicate) {
          throw new BadRequestException(
            'Este producto ya existe como opción activa dentro de este grupo.',
          );
        }
      }

      if (targetType === ItemOptionTargetType.NONE && input.name) {
        const options = await this.prisma.itemOption.findMany({
          where: {
            groupId: group.id,
            targetType: ItemOptionTargetType.NONE,
            isActive: true,
            ...(optionId ? { id: { not: optionId } } : {}),
          },
        });
        const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
        const normalizedInput = normalizeName(input.name);
        const hasDuplicate = options.some(
          (o) => normalizeName(o.name) === normalizedInput,
        );
        if (hasDuplicate) {
          throw new BadRequestException(
            'Ya existe una opción con ese nombre dentro de este grupo.',
          );
        }
      }
    }

    return {
      targetType,
      ingredientId,
      itemId,
      quantity,
      unitId,
    };
  }

  private async validateActiveDefaults(groupId: string) {
    const group = await this.prisma.itemOptionGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: { options: { where: { isActive: true } } },
    });

    const defaults = group.options.filter((option) => option.selectedByDefault);
    if (group.maxSelections != null && defaults.length > group.maxSelections) {
      throw new BadRequestException(
        'selectedByDefault options cannot exceed maxSelections',
      );
    }
    if (group.maxSelections === 1 && defaults.length > 1) {
      throw new BadRequestException(
        'maxSelections=1 allows only one selectedByDefault option',
      );
    }
  }

  private validateSelectionActions(selections: OptionSelectionActionInput[]) {
    if (!Array.isArray(selections)) {
      throw new BadRequestException('optionSelections must be an array');
    }

    const seen = new Set<string>();
    const allowed = new Set(['SELECT', 'ADD', 'REMOVE']);
    for (const selection of selections) {
      if (
        !selection ||
        typeof selection.groupId !== 'string' ||
        typeof selection.optionId !== 'string' ||
        typeof selection.action !== 'string'
      ) {
        throw new BadRequestException('optionSelections contains an invalid action');
      }
      if (!allowed.has(selection.action)) {
        throw new BadRequestException('optionSelections contains an invalid action');
      }
      if (seen.has(selection.optionId)) {
        throw new BadRequestException(
          'optionSelections cannot contain duplicate option actions',
        );
      }
      seen.add(selection.optionId);
    }
  }

  private buildOptionSnapshot(input: {
    group: any;
    option: any;
    action: OrderItemOptionAction;
    quantityPerUnit: Prisma.Decimal | null;
    totalQuantity: Prisma.Decimal | null;
    unitId: string | null;
    unitLabel: string | null;
  }): Prisma.OrderItemOptionCreateWithoutOrderItemInput {
    const { group, option, action, quantityPerUnit, totalQuantity, unitId, unitLabel } =
      input;

    return {
      group: { connect: { id: group.id } },
      option: { connect: { id: option.id } },
      groupTitleSnapshot: group.title,
      optionNameSnapshot: option.name,
      targetTypeSnapshot: option.targetType,
      ingredient:
        option.ingredientId != null
          ? { connect: { id: option.ingredientId } }
          : undefined,
      item:
        option.itemId != null ? { connect: { id: option.itemId } } : undefined,
      quantityModeSnapshot: group.quantityMode,
      quantityPerUnitSnapshot: quantityPerUnit,
      totalQuantitySnapshot: totalQuantity,
      unitIdSnapshot: unitId,
      unitLabelSnapshot: unitLabel,
      priceDeltaSnapshot: option.priceDelta,
      selectedByDefaultSnapshot: option.selectedByDefault,
      action,
    };
  }

  private async assertUnit(unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, isActive: true },
    });
    if (!unit) throw new BadRequestException('Unit is invalid');
    return unit;
  }

  private async assertIngredient(businessId: string, ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
    });
    if (!ingredient) throw new BadRequestException('Ingredient is invalid');
    return ingredient;
  }

  private async assertTargetItem(businessId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, businessId },
    });
    if (!item) throw new BadRequestException('Target item is invalid');
    return item;
  }

  private async assertIngredientCompatibleWithUnit(
    businessId: string,
    ingredientId: string,
    unitId: string | null,
  ) {
    if (!unitId) throw new BadRequestException('SHARED_TOTAL requires a unit');
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
      select: { stockUnitId: true },
    });
    if (!ingredient) throw new BadRequestException('Ingredient is invalid');
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'SHARED_TOTAL ingredients must use the Unit catalog',
      );
    }
    if (ingredient.stockUnitId === unitId) return;

    const conversion = await this.prisma.unitConversion.findFirst({
      where: {
        OR: [
          { fromUnitId: unitId, toUnitId: ingredient.stockUnitId },
          { fromUnitId: ingredient.stockUnitId, toUnitId: unitId },
        ],
      },
    });
    if (!conversion) {
      throw new BadRequestException('Ingredient unit is incompatible with group unit');
    }
  }

  private decimal(value: string | number | Prisma.Decimal, field: string) {
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(`${field} must be numeric`);
    }
  }

  private positiveDecimal(value: string | number | Prisma.Decimal, field: string) {
    const decimal = this.decimal(value, field);
    if (decimal.lte(0)) {
      throw new BadRequestException(`${field} must be greater than 0`);
    }
    return decimal;
  }

  private groupInclude() {
    return {
      totalQuantityUnit: true,
      options: {
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        include: this.optionInclude(),
      },
    };
  }

  private optionInclude() {
    return {
      ingredient: {
        select: {
          id: true,
          name: true,
          stockUnitId: true,
          customUnitLabel: true,
        },
      },
      item: {
        select: {
          id: true,
          name: true,
          type: true,
          inventoryMode: true,
        },
      },
      unit: true,
    };
  }

  private mapGroup(group: any) {
    return {
      ...group,
      totalQuantityLimit:
        group.totalQuantityLimit == null ? null : Number(group.totalQuantityLimit),
      options: (group.options ?? []).map((option: any) => this.mapOption(option)),
    };
  }

  private mapOption(option: any) {
    return {
      ...option,
      quantity: option.quantity == null ? null : Number(option.quantity),
      priceDelta: Number(option.priceDelta ?? 0),
    };
  }
}
