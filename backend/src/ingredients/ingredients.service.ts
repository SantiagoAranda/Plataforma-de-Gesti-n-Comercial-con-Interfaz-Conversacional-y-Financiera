import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IngredientUnit, Prisma, UnitKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { ListIngredientsQueryDto } from './dto/list-ingredients.query.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpsertPurchasePresentationDto } from './dto/purchase-presentation.dto';

@Injectable()
export class IngredientsService {
  constructor(private prisma: PrismaService) {}

  private readonly fixedPurchaseConversionCodes: Record<string, string[]> = {
    G: ['KG'],
    ML: ['L'],
    CM: ['M'],
    UNIT: ['SIX_PACK', 'DOZEN'],
  };

  private readonly editablePresentationCodesByStockUnit: Record<
    string,
    string[]
  > = {
    G: ['PACKAGE', 'BAG', 'BOX', 'BUCKET', 'BULTO'],
    KG: ['PACKAGE', 'BAG', 'BOX', 'BUCKET', 'GARRAFA', 'BULTO'],
    ML: ['BOTTLE', 'GARRAFA', 'BIDON', 'BOX'],
    L: ['BOTTLE', 'GARRAFA', 'BIDON', 'BOX'],
    CM: ['ROLL'],
    M: ['ROLL'],
    UNIT: ['BOX', 'PACKAGE'],
  };

  private normalizeText(value: string) {
    return value.trim();
  }

  private async assertNameAvailable(
    businessId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.ingredient.findFirst({
      where: {
        businessId,
        deletedAt: null,
        name: { equals: this.normalizeText(name), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { status: true },
    });
    if (!existing) return;

    throw new ConflictException({
      code: 'INGREDIENT_NAME_ALREADY_EXISTS',
      message:
        existing.status === 'INACTIVE'
          ? 'Ya existe un ingrediente inactivo con este nombre. Puedes reactivarlo o eliminarlo antes de crear uno nuevo.'
          : 'Ya existe un ingrediente con este nombre.',
    });
  }

  private handleKnownPrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code: 'INGREDIENT_NAME_ALREADY_EXISTS',
        message: 'Ya existe un ingrediente con este nombre.',
      });
    }

    throw error;
  }

  private async getUnitByCode(
    code: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.unit.findUnique({ where: { code: String(code).toUpperCase() } });
  }

  private async getUnitById(
    id: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.unit.findUnique({ where: { id } });
  }

  private lockedPresentationId(fromCode: string, toCode: string) {
    return `fixed:${fromCode}:${toCode}`;
  }

  private isLockedPresentationId(id: string) {
    return id.startsWith('fixed:');
  }

  private async resolveIngredientUnits(
    input: {
      stockUnitId?: string;
      defaultPurchaseUnitId?: string;
      consumptionUnit?: IngredientUnit | string;
      purchaseUnit?: IngredientUnit | string;
    },
    existing?: {
      stockUnitId?: string | null;
      defaultPurchaseUnitId?: string | null;
      consumptionUnit?: IngredientUnit | string | null;
      purchaseUnit?: IngredientUnit | string | null;
    },
  ) {
    const stockUnit =
      input.stockUnitId !== undefined
        ? await this.getUnitById(input.stockUnitId)
        : input.consumptionUnit !== undefined
          ? await this.getUnitByCode(input.consumptionUnit)
          : existing?.stockUnitId
            ? await this.getUnitById(existing.stockUnitId)
            : existing?.consumptionUnit
              ? await this.getUnitByCode(existing.consumptionUnit)
              : null;

    const defaultPurchaseUnit =
      input.defaultPurchaseUnitId !== undefined
        ? await this.getUnitById(input.defaultPurchaseUnitId)
        : input.purchaseUnit !== undefined
          ? await this.getUnitByCode(input.purchaseUnit)
          : existing?.defaultPurchaseUnitId
            ? await this.getUnitById(existing.defaultPurchaseUnitId)
            : existing?.purchaseUnit
              ? await this.getUnitByCode(existing.purchaseUnit)
              : null;

    if (!stockUnit || !defaultPurchaseUnit) {
      throw new BadRequestException('La unidad del insumo no existe.');
    }

    if (defaultPurchaseUnit.kind === UnitKind.COMMERCIAL) {
      throw new BadRequestException(
        'La unidad normal de compra no es compatible con la unidad base del insumo.',
      );
    }

    const conversion = await this.prisma.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: defaultPurchaseUnit.id,
          toUnitId: stockUnit.id,
        },
      },
    });

    if (!conversion) {
      throw new BadRequestException(
        'La unidad normal de compra no es compatible con la unidad base del insumo.',
      );
    }

    return {
      stockUnit,
      defaultPurchaseUnit,
      stockUnitId: stockUnit.id,
      defaultPurchaseUnitId: defaultPurchaseUnit.id,
      purchaseToConsumptionFactor: new Prisma.Decimal(conversion.factor),
    };
  }

  private toLegacyIngredientUnit(unitCode: string, fallbackStockCode: string) {
    const normalized = unitCode.toUpperCase();
    if (['G', 'KG', 'ML', 'L', 'UNIT'].includes(normalized)) {
      return normalized as IngredientUnit;
    }
    if (['PACKAGE', 'DOZEN', 'BOX'].includes(normalized)) {
      return IngredientUnit.UNIT;
    }
    if (normalized === 'LB') {
      return IngredientUnit.KG;
    }
    return this.toLegacyIngredientUnit(fallbackStockCode, 'UNIT');
  }

  private resolveRecipeUnitFields(
    recipeUnitLabelInput?: string,
    recipeUnitFactorInput?: string,
    existing?: {
      recipeUnitLabel: string | null;
      recipeUnitFactor: Prisma.Decimal | null;
    },
  ) {
    const label =
      recipeUnitLabelInput !== undefined
        ? recipeUnitLabelInput?.trim() || null
        : existing
          ? existing.recipeUnitLabel
          : null;

    const factorStr =
      recipeUnitFactorInput !== undefined
        ? recipeUnitFactorInput
        : existing && existing.recipeUnitFactor
          ? existing.recipeUnitFactor.toString()
          : null;

    if (label && !factorStr) {
      throw new BadRequestException(
        'recipeUnitFactor is required when recipeUnitLabel is provided',
      );
    }
    if (!label && factorStr) {
      throw new BadRequestException(
        'recipeUnitLabel is required when recipeUnitFactor is provided',
      );
    }

    if (label && factorStr) {
      const factor = new Prisma.Decimal(factorStr);
      if (factor.lte(0)) {
        throw new BadRequestException(
          'recipeUnitFactor must be greater than zero',
        );
      }
      return { recipeUnitLabel: label, recipeUnitFactor: factor };
    }

    return { recipeUnitLabel: null, recipeUnitFactor: null };
  }

  private async getPresentationFactorToBaseUnit(
    tx: Prisma.TransactionClient | PrismaService,
    presentation: {
      innerQuantity: Prisma.Decimal | number | string;
      contentQuantity: Prisma.Decimal | number | string;
      contentUnitId: string;
    },
    stockUnitId: string,
  ) {
    if (presentation.contentUnitId === stockUnitId) {
      return new Prisma.Decimal(presentation.innerQuantity)
        .mul(new Prisma.Decimal(presentation.contentQuantity))
        .toDecimalPlaces(6);
    }

    const conversion = await tx.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: presentation.contentUnitId,
          toUnitId: stockUnitId,
        },
      },
    });

    if (!conversion) return null;

    return new Prisma.Decimal(presentation.innerQuantity)
      .mul(new Prisma.Decimal(presentation.contentQuantity))
      .mul(new Prisma.Decimal(conversion.factor))
      .toDecimalPlaces(6);
  }

  private async formatPurchasePresentation(
    tx: Prisma.TransactionClient | PrismaService,
    presentation: any,
    stockUnitId: string,
  ) {
    const factorToBaseUnit = await this.getPresentationFactorToBaseUnit(
      tx,
      presentation,
      stockUnitId,
    );

    return {
      ...presentation,
      purchaseUnitLabel:
        presentation.purchaseUnit?.symbol ||
        presentation.purchaseUnit?.name ||
        presentation.name,
      factorToBaseUnit,
      isLocked: false,
    };
  }

  private async reloadPurchasePresentation(
    tx: Prisma.TransactionClient,
    presentationId: string,
    stockUnitId: string,
  ) {
    const presentation =
      await tx.ingredientPurchasePresentation.findUniqueOrThrow({
        where: { id: presentationId },
        include: { purchaseUnit: true, contentUnit: true },
      });
    return this.formatPurchasePresentation(tx, presentation, stockUnitId);
  }

  private async buildLockedPurchasePresentations(
    tx: Prisma.TransactionClient | PrismaService,
    ingredient: {
      id: string;
      businessId: string;
      stockUnitId: string | null;
      defaultPurchaseUnitId?: string | null;
      stockUnit?: any;
    },
  ) {
    if (!ingredient.stockUnitId || !ingredient.stockUnit?.code) return [];

    const fromCodes =
      this.fixedPurchaseConversionCodes[ingredient.stockUnit.code] ?? [];
    if (fromCodes.length === 0) return [];

    const conversions = await tx.unitConversion.findMany({
      where: {
        toUnitId: ingredient.stockUnitId,
        fromUnit: { code: { in: fromCodes }, isActive: true },
      },
      include: { fromUnit: true, toUnit: true },
      orderBy: { factor: 'asc' },
    });

    return conversions.map((conversion) => {
      const from = conversion.fromUnit;
      const to = conversion.toUnit;
      const factor = new Prisma.Decimal(conversion.factor).toDecimalPlaces(6);

      return {
        id: this.lockedPresentationId(from.code, to.code),
        businessId: ingredient.businessId,
        ingredientId: ingredient.id,
        name: from.name,
        purchaseUnitId: from.id,
        purchaseUnit: from,
        innerQuantity: new Prisma.Decimal(1),
        innerUnitLabel: null,
        contentQuantity: factor,
        contentUnitId: to.id,
        contentUnit: to,
        isDefault: ingredient.defaultPurchaseUnitId === from.id,
        isActive: true,
        purchaseUnitLabel: from.symbol || from.name,
        factorToBaseUnit: factor,
        isLocked: true,
      };
    });
  }

  private sortPurchasePresentationsForUi(presentations: any[]) {
    return [...presentations].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      if (a.isLocked !== b.isLocked) return a.isLocked ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
  }

  private ensureEditablePresentationAllowed(
    ingredient: { stockUnit?: { code: string } | null },
    purchaseUnit: { code: string; name: string },
  ) {
    const stockCode = ingredient.stockUnit?.code;
    const allowedCodes = stockCode
      ? (this.editablePresentationCodesByStockUnit[stockCode] ?? [])
      : [];

    if (!allowedCodes.includes(purchaseUnit.code)) {
      throw new BadRequestException(
        'La presentación de compra no está permitida para la unidad base del insumo.',
      );
    }
  }

  async create(businessId: string, dto: CreateIngredientDto) {
    await this.assertNameAvailable(businessId, dto.name);
    const units = await this.resolveIngredientUnits(dto);

    const minStock = new Prisma.Decimal(dto.minStock ?? 0);
    if (minStock.lt(0)) {
      throw new BadRequestException(
        'minStock must be greater than or equal to zero',
      );
    }

    const recipeFields = this.resolveRecipeUnitFields(
      dto.recipeUnitLabel,
      dto.recipeUnitFactor,
    );

    let finalFactor = units.purchaseToConsumptionFactor;
    if (dto.purchaseToConsumptionFactor !== undefined) {
      const explicitFactor = new Prisma.Decimal(
        dto.purchaseToConsumptionFactor,
      );
      if (explicitFactor.lte(0)) {
        throw new BadRequestException(
          'purchaseToConsumptionFactor must be greater than zero',
        );
      }
      const isWeightOrVolume =
        (units.stockUnit.kind === UnitKind.WEIGHT &&
          units.defaultPurchaseUnit.kind === UnitKind.WEIGHT) ||
        (units.stockUnit.kind === UnitKind.VOLUME &&
          units.defaultPurchaseUnit.kind === UnitKind.VOLUME);

      if (!isWeightOrVolume) {
        finalFactor = explicitFactor;
      }
    }

    try {
      return await this.prisma.ingredient.create({
        data: {
          businessId,
          name: this.normalizeText(dto.name),
          consumptionUnit: this.toLegacyIngredientUnit(
            units.stockUnit.code,
            units.stockUnit.code,
          ),
          purchaseUnit: this.toLegacyIngredientUnit(
            units.defaultPurchaseUnit.code,
            units.stockUnit.code,
          ),
          stockUnitId: units.stockUnitId,
          defaultPurchaseUnitId: units.defaultPurchaseUnitId,
          purchaseToConsumptionFactor: finalFactor,
          customUnitLabel: undefined,
          minStock,
          recipeUnitLabel: recipeFields.recipeUnitLabel,
          recipeUnitFactor: recipeFields.recipeUnitFactor,
        },
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
    }
  }

  async findAll(businessId: string, query: ListIngredientsQueryDto) {
    const search = query.search?.trim();

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        _count: { select: { inventoryMovements: true } },
        stockUnit: true,
        defaultPurchaseUnit: true,
      },
      orderBy: { name: 'asc' },
    });

    return ingredients.map((ingredient) => this.withMovementFlags(ingredient));
  }

  async findOne(businessId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        _count: { select: { inventoryMovements: true } },
        stockUnit: true,
        defaultPurchaseUnit: true,
        purchasePresentations: {
          where: { isActive: true },
          include: { purchaseUnit: true, contentUnit: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    const lockedPresentations = await this.buildLockedPurchasePresentations(
      this.prisma,
      ingredient,
    );
    const persistedPresentations = ingredient.purchasePresentations ?? [];
    const editablePresentations = ingredient.stockUnitId
      ? await Promise.all(
          persistedPresentations.map((presentation) =>
            this.formatPurchasePresentation(
              this.prisma,
              presentation,
              ingredient.stockUnitId,
            ),
          ),
        )
      : persistedPresentations;

    return this.withMovementFlags({
      ...ingredient,
      purchasePresentations: this.sortPurchasePresentationsForUi([
        ...editablePresentations,
        ...lockedPresentations,
      ]),
    });
  }

  async update(businessId: string, id: string, dto: UpdateIngredientDto) {
    const existing = await this.findOne(businessId, id);

    if (dto.name !== undefined) {
      await this.assertNameAvailable(businessId, dto.name, id);
    }

    if (dto.minStock !== undefined && new Prisma.Decimal(dto.minStock).lt(0)) {
      throw new BadRequestException(
        'minStock must be greater than or equal to zero',
      );
    }

    const unitsTouched =
      dto.stockUnitId !== undefined ||
      dto.defaultPurchaseUnitId !== undefined ||
      dto.purchaseUnit !== undefined ||
      dto.consumptionUnit !== undefined;
    const units = unitsTouched
      ? await this.resolveIngredientUnits(dto, existing)
      : undefined;
    let finalFactor: Prisma.Decimal | undefined = undefined;
    if (units) {
      finalFactor = units.purchaseToConsumptionFactor;
    } else if (dto.purchaseToConsumptionFactor !== undefined) {
      const explicitFactor = new Prisma.Decimal(
        dto.purchaseToConsumptionFactor,
      );
      if (explicitFactor.lte(0)) {
        throw new BadRequestException(
          'purchaseToConsumptionFactor must be greater than zero',
        );
      }
      finalFactor = explicitFactor;
    }

    const recipeFields =
      dto.recipeUnitLabel !== undefined || dto.recipeUnitFactor !== undefined
        ? this.resolveRecipeUnitFields(
            dto.recipeUnitLabel,
            dto.recipeUnitFactor,
            existing,
          )
        : undefined;

    try {
      return await this.prisma.ingredient.update({
        where: { id },
        data: {
          name:
            dto.name === undefined ? undefined : this.normalizeText(dto.name),
          status: dto.status,
          consumptionUnit: units
            ? this.toLegacyIngredientUnit(
                units.stockUnit.code,
                units.stockUnit.code,
              )
            : undefined,
          purchaseUnit: units
            ? this.toLegacyIngredientUnit(
                units.defaultPurchaseUnit.code,
                units.stockUnit.code,
              )
            : undefined,
          stockUnitId: units?.stockUnitId,
          defaultPurchaseUnitId: units?.defaultPurchaseUnitId,
          customUnitLabel: undefined,
          purchaseToConsumptionFactor: finalFactor,
          minStock:
            dto.minStock === undefined
              ? undefined
              : new Prisma.Decimal(dto.minStock),
          recipeUnitLabel:
            recipeFields === undefined
              ? undefined
              : recipeFields.recipeUnitLabel,
          recipeUnitFactor:
            recipeFields === undefined
              ? undefined
              : recipeFields.recipeUnitFactor,
        },
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
    }
  }

  async deactivate(businessId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Ingredient" WHERE "businessId" = ${businessId} AND "id" = ${id} FOR UPDATE`,
      );

      const ingredient = await tx.ingredient.findFirst({
        where: { id, businessId, deletedAt: null },
      });
      if (!ingredient) throw new NotFoundException('Ingredient not found');

      // Revalidate operational dependencies after acquiring the ingredient lock.
      // They are intentionally preserved; review state is derived from status.
      await this.loadDeactivationDependencies(tx, businessId, id);

      return tx.ingredient.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
    });
  }

  async getDeactivationImpact(businessId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, businessId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');

    const dependencies = await this.loadDeactivationDependencies(
      this.prisma,
      businessId,
      id,
    );

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      dependencies,
      summary: {
        recipes: dependencies.recipes.length,
        services: dependencies.services.length,
        itemOptions: dependencies.itemOptions.length,
        total:
          dependencies.recipes.length +
          dependencies.services.length +
          dependencies.itemOptions.length,
      },
    };
  }

  private async loadDeactivationDependencies(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    ingredientId: string,
  ) {
    const [recipes, services, itemOptions] = await Promise.all([
      tx.recipe.findMany({
        where: { businessId, ingredientId },
        include: {
          item: { select: { id: true, name: true, status: true } },
          ingredient: {
            select: {
              consumptionUnit: true,
              customUnitLabel: true,
              stockUnit: { select: { symbol: true, name: true } },
            },
          },
        },
        orderBy: [{ item: { name: 'asc' } }, { id: 'asc' }],
      }),
      tx.serviceIngredient.findMany({
        where: { businessId, ingredientId, isActive: true },
        include: {
          serviceItem: { select: { id: true, name: true, status: true } },
          ingredient: {
            select: {
              consumptionUnit: true,
              customUnitLabel: true,
              stockUnit: { select: { symbol: true, name: true } },
            },
          },
        },
        orderBy: [{ serviceItem: { name: 'asc' } }, { id: 'asc' }],
      }),
      tx.itemOption.findMany({
        where: {
          businessId,
          ingredientId,
          isActive: true,
          group: { isActive: true },
        },
        include: {
          group: {
            select: {
              id: true,
              title: true,
              item: { select: { id: true, name: true, status: true } },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const unitLabel = (ingredient: {
      customUnitLabel: string | null;
      consumptionUnit: string;
      stockUnit: { symbol: string; name: string } | null;
    }) =>
      ingredient.stockUnit?.symbol ??
      ingredient.stockUnit?.name ??
      ingredient.customUnitLabel ??
      ingredient.consumptionUnit;

    return {
      recipes: recipes.map((line) => ({
        itemId: line.item.id,
        itemName: line.item.name,
        itemStatus: line.item.status,
        quantity: line.quantityRequired.toString(),
        unitLabel: unitLabel(line.ingredient),
        isOptional: line.isOptional,
      })),
      services: services.map((line) => ({
        serviceIngredientId: line.id,
        itemId: line.serviceItem.id,
        itemName: line.serviceItem.name,
        itemStatus: line.serviceItem.status,
        quantity: line.quantityRequired.toString(),
        unitLabel: unitLabel(line.ingredient),
      })),
      itemOptions: itemOptions.map((option) => ({
        optionId: option.id,
        optionName: option.name,
        groupId: option.group.id,
        groupName: option.group.title,
        itemId: option.group.item.id,
        itemName: option.group.item.name,
        itemStatus: option.group.item.status,
      })),
    };
  }

  async reactivate(businessId: string, id: string) {
    const ingredient = await this.findOne(businessId, id);

    if (ingredient.status === 'ACTIVE') {
      return ingredient;
    }

    return this.prisma.ingredient.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  private async loadDeletionState(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    ingredientId: string,
  ) {
    const [
      inventoryMovements,
      recipes,
      serviceIngredients,
      itemOptions,
      purchasePresentations,
      orderItemOptions,
    ] = await Promise.all([
      tx.inventoryMovement.count({ where: { businessId, ingredientId } }),
      tx.recipe.count({ where: { businessId, ingredientId } }),
      tx.serviceIngredient.count({ where: { businessId, ingredientId } }),
      tx.itemOption.count({ where: { businessId, ingredientId } }),
      tx.ingredientPurchasePresentation.count({
        where: { businessId, ingredientId },
      }),
      tx.orderItemOption.count({
        where: { ingredientId, orderItem: { order: { businessId } } },
      }),
    ]);

    const protectedRelations = {
      inventoryMovements,
      recipes,
      serviceIngredients,
      itemOptions,
      purchasePresentations,
      orderItemOptions,
    };
    const protectedRelationCount = Object.values(protectedRelations).reduce(
      (sum, count) => sum + count,
      0,
    );
    return { protectedRelations, protectedRelationCount };
  }

  private deletionMode(
    ingredient: { currentStock: Prisma.Decimal; averageCost: Prisma.Decimal },
    protectedRelationCount: number,
  ) {
    if (protectedRelationCount > 0) return 'PRESERVE_REQUIRED' as const;
    if (
      !new Prisma.Decimal(ingredient.currentStock).isZero() ||
      !new Prisma.Decimal(ingredient.averageCost).isZero()
    ) {
      return 'RESIDUAL_DECISION_REQUIRED' as const;
    }
    return 'HARD_DELETE' as const;
  }

  async getDeletionImpact(businessId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { stockUnit: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');

    const [dependencies, deletionState] = await Promise.all([
      this.loadDeactivationDependencies(this.prisma, businessId, id),
      this.loadDeletionState(this.prisma, businessId, id),
    ]);
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      deletionMode: this.deletionMode(
        ingredient,
        deletionState.protectedRelationCount,
      ),
      currentStock: ingredient.currentStock.toString(),
      averageCost: ingredient.averageCost.toString(),
      unitLabel:
        ingredient.stockUnit?.symbol ??
        ingredient.customUnitLabel ??
        ingredient.consumptionUnit,
      dependencies,
      summary: {
        recipes: dependencies.recipes.length,
        services: dependencies.services.length,
        itemOptions: dependencies.itemOptions.length,
        total:
          dependencies.recipes.length +
          dependencies.services.length +
          dependencies.itemOptions.length,
      },
      protectedRelations: deletionState.protectedRelations,
    };
  }

  async remove(
    businessId: string,
    id: string,
    residualInventoryAction?: string,
  ) {
    const allowedActions = [
      undefined,
      'DELETE_PERMANENTLY',
      'PRESERVE_HISTORY',
    ];
    if (!allowedActions.includes(residualInventoryAction)) {
      throw new BadRequestException('Invalid residualInventoryAction');
    }

    return this.runSerializableTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Ingredient" WHERE "businessId" = ${businessId} AND "id" = ${id} AND "deletedAt" IS NULL FOR UPDATE`,
      );
      const ingredient = await tx.ingredient.findFirst({
        where: { id, businessId, deletedAt: null },
      });
      if (!ingredient) throw new NotFoundException('Ingredient not found');

      const deletionState = await this.loadDeletionState(tx, businessId, id);
      const mode = this.deletionMode(
        ingredient,
        deletionState.protectedRelationCount,
      );

      if (
        mode === 'PRESERVE_REQUIRED' ||
        (mode === 'RESIDUAL_DECISION_REQUIRED' &&
          residualInventoryAction === 'PRESERVE_HISTORY')
      ) {
        await tx.ingredient.update({
          where: { id },
          data: { status: 'INACTIVE', deletedAt: new Date() },
        });
        return {
          deleted: true,
          preservedHistory: true,
          ingredientId: id,
          deletionMode: 'SOFT_DELETE' as const,
        };
      }

      if (
        mode === 'RESIDUAL_DECISION_REQUIRED' &&
        residualInventoryAction !== 'DELETE_PERMANENTLY'
      ) {
        throw new ConflictException({
          code: 'INGREDIENT_DELETION_DECISION_REQUIRED',
          message:
            'El ingrediente conserva saldo o costo residual. Debes elegir cómo eliminarlo.',
          currentStock: ingredient.currentStock.toString(),
          averageCost: ingredient.averageCost.toString(),
        });
      }

      await tx.ingredient.delete({ where: { id } });
      return {
        deleted: true,
        preservedHistory: false,
        ingredientId: id,
        deletionMode: 'HARD_DELETE' as const,
      };
    });
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              String(
                (error.meta as { code?: unknown } | undefined)?.code ?? '',
              ) === '40001'));
        if (!retryable || attempt === maxAttempts) throw error;
      }
    }
    throw new ConflictException('Could not serialize ingredient deletion');
  }

  async listPurchasePresentations(businessId: string, ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId, deletedAt: null },
      include: { stockUnit: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'Ingredient must have stockUnitId before configuring purchase presentations',
      );
    }

    const [lockedPresentations, editablePresentations] = await Promise.all([
      this.buildLockedPurchasePresentations(this.prisma, ingredient),
      this.prisma.ingredientPurchasePresentation.findMany({
        where: { businessId, ingredientId, isActive: true },
        include: { purchaseUnit: true, contentUnit: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);

    const formattedEditablePresentations = await Promise.all(
      editablePresentations.map((presentation) =>
        this.formatPurchasePresentation(
          this.prisma,
          presentation,
          ingredient.stockUnitId,
        ),
      ),
    );

    return this.sortPurchasePresentationsForUi([
      ...formattedEditablePresentations,
      ...lockedPresentations,
    ]);
  }

  private async validatePresentationInput(
    tx: Prisma.TransactionClient,
    businessId: string,
    ingredientId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, businessId, deletedAt: null },
      include: { stockUnit: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'Ingredient must have stockUnitId before configuring purchase presentations',
      );
    }

    const innerQuantity = new Prisma.Decimal(dto.innerQuantity);
    const contentQuantity = new Prisma.Decimal(dto.contentQuantity);
    if (innerQuantity.lte(0))
      throw new BadRequestException('innerQuantity must be greater than zero');
    if (contentQuantity.lte(0))
      throw new BadRequestException(
        'contentQuantity must be greater than zero',
      );

    const [purchaseUnit, contentUnit] = await Promise.all([
      tx.unit.findUnique({ where: { id: dto.purchaseUnitId } }),
      tx.unit.findUnique({ where: { id: dto.contentUnitId } }),
    ]);

    if (
      !purchaseUnit ||
      !purchaseUnit.isActive ||
      purchaseUnit.kind !== UnitKind.COMMERCIAL
    ) {
      throw new BadRequestException(
        'purchaseUnitId must reference a commercial unit',
      );
    }
    if (
      !contentUnit ||
      !contentUnit.isActive ||
      contentUnit.kind === UnitKind.COMMERCIAL
    ) {
      throw new BadRequestException(
        'contentUnitId must reference a standard unit',
      );
    }

    if (!dto.innerUnitLabel?.trim()) {
      throw new BadRequestException('innerUnitLabel is required');
    }

    if (dto.contentUnitId !== ingredient.stockUnitId) {
      const conversion = await tx.unitConversion.findUnique({
        where: {
          fromUnitId_toUnitId: {
            fromUnitId: dto.contentUnitId,
            toUnitId: ingredient.stockUnitId,
          },
        },
        include: { fromUnit: true, toUnit: true },
      });
      if (!conversion || new Prisma.Decimal(conversion.factor).lte(0)) {
        throw new BadRequestException(
          'contentUnit must be directly convertible to ingredient stock unit',
        );
      }
      if (
        conversion.fromUnit.isActive === false ||
        conversion.toUnit.isActive === false ||
        conversion.fromUnit.kind === UnitKind.COMMERCIAL ||
        conversion.toUnit.kind === UnitKind.COMMERCIAL
      ) {
        throw new BadRequestException(
          'UnitConversion must use active standard units',
        );
      }
    }

    return { ingredient, innerQuantity, contentQuantity };
  }

  private async normalizePresentationDefaults(
    tx: Prisma.TransactionClient,
    businessId: string,
    ingredientId: string,
  ) {
    await tx.ingredientPurchasePresentation.updateMany({
      where: { businessId, ingredientId, isActive: false, isDefault: true },
      data: { isDefault: false },
    });

    const active = await tx.ingredientPurchasePresentation.findMany({
      where: { businessId, ingredientId, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, isDefault: true },
    });

    if (active.length === 0) {
      await tx.ingredientPurchasePresentation.updateMany({
        where: { businessId, ingredientId, isDefault: true },
        data: { isDefault: false },
      });
      return;
    }

    const defaults = active.filter((presentation) => presentation.isDefault);
    if (defaults.length === 0) {
      await tx.ingredientPurchasePresentation.update({
        where: { id: active[0].id },
        data: { isDefault: true },
      });
    } else if (defaults.length > 1) {
      const keepId = defaults[0].id;
      await tx.ingredientPurchasePresentation.updateMany({
        where: {
          businessId,
          ingredientId,
          isDefault: true,
          id: { not: keepId },
        },
        data: { isDefault: false },
      });
    }
  }

  private async assertPresentationDefaultInvariant(
    tx: Prisma.TransactionClient,
    businessId: string,
    ingredientId: string,
  ) {
    const presentations = await tx.ingredientPurchasePresentation.findMany({
      where: { businessId, ingredientId },
      select: { isActive: true, isDefault: true },
    });
    const activeCount = presentations.filter(
      (presentation) => presentation.isActive,
    ).length;
    const defaultCount = presentations.filter(
      (presentation) => presentation.isActive && presentation.isDefault,
    ).length;
    const inactiveDefaultCount = presentations.filter(
      (presentation) => !presentation.isActive && presentation.isDefault,
    ).length;

    if (
      inactiveDefaultCount > 0 ||
      (activeCount === 0 && defaultCount !== 0) ||
      (activeCount > 0 && defaultCount !== 1)
    ) {
      throw new ConflictException(
        'Purchase presentation default invariant failed',
      );
    }
  }

  private async runPresentationTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === maxAttempts) throw error;
      }
    }
    throw new ConflictException(
      'Could not serialize purchase presentation update',
    );
  }

  async createPurchasePresentation(
    businessId: string,
    ingredientId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    return this.runPresentationTransaction(async (tx) => {
      const validated = await this.validatePresentationInput(
        tx,
        businessId,
        ingredientId,
        dto,
      );

      if (dto.isDefault) {
        await tx.ingredientPurchasePresentation.updateMany({
          where: { businessId, ingredientId, isActive: true, isDefault: true },
          data: { isDefault: false },
        });
      }

      const existing = await tx.ingredientPurchasePresentation.findFirst({
        where: {
          businessId,
          ingredientId,
          purchaseUnitId: dto.purchaseUnitId,
        },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });

      if (existing) {
        const updated = await tx.ingredientPurchasePresentation.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            innerQuantity: validated.innerQuantity,
            innerUnitLabel: dto.innerUnitLabel.trim(),
            contentQuantity: validated.contentQuantity,
            contentUnitId: dto.contentUnitId,
            isDefault: !!dto.isDefault,
            isActive: true,
          },
          include: { purchaseUnit: true, contentUnit: true },
        });

        await this.normalizePresentationDefaults(tx, businessId, ingredientId);
        await this.assertPresentationDefaultInvariant(
          tx,
          businessId,
          ingredientId,
        );
        return this.reloadPurchasePresentation(
          tx,
          updated.id,
          validated.ingredient.stockUnitId,
        );
      }

      const created = await tx.ingredientPurchasePresentation.create({
        data: {
          businessId,
          ingredientId,
          name: dto.name.trim(),
          purchaseUnitId: dto.purchaseUnitId,
          innerQuantity: validated.innerQuantity,
          innerUnitLabel: dto.innerUnitLabel.trim(),
          contentQuantity: validated.contentQuantity,
          contentUnitId: dto.contentUnitId,
          isDefault: !!dto.isDefault,
          isActive: dto.isActive ?? true,
        },
        include: { purchaseUnit: true, contentUnit: true },
      });

      await this.normalizePresentationDefaults(tx, businessId, ingredientId);
      await this.assertPresentationDefaultInvariant(
        tx,
        businessId,
        ingredientId,
      );
      return this.reloadPurchasePresentation(
        tx,
        created.id,
        validated.ingredient.stockUnitId,
      );
    });
  }

  async updatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    if (this.isLockedPresentationId(presentationId)) {
      throw new BadRequestException(
        'Las conversiones fijas no se pueden editar.',
      );
    }

    return this.runPresentationTransaction(async (tx) => {
      const existing = await tx.ingredientPurchasePresentation.findFirst({
        where: { id: presentationId, businessId, ingredientId },
      });
      if (!existing)
        throw new NotFoundException('Purchase presentation not found');

      const validated = await this.validatePresentationInput(
        tx,
        businessId,
        ingredientId,
        dto,
      );

      if (dto.isDefault) {
        await tx.ingredientPurchasePresentation.updateMany({
          where: {
            businessId,
            ingredientId,
            isActive: true,
            isDefault: true,
            id: { not: presentationId },
          },
          data: { isDefault: false },
        });
      }

      const updated = await tx.ingredientPurchasePresentation.update({
        where: { id: presentationId },
        data: {
          name: dto.name.trim(),
          purchaseUnitId: dto.purchaseUnitId,
          innerQuantity: validated.innerQuantity,
          innerUnitLabel: dto.innerUnitLabel.trim(),
          contentQuantity: validated.contentQuantity,
          contentUnitId: dto.contentUnitId,
          isDefault: !!dto.isDefault,
          isActive: dto.isActive ?? true,
        },
        include: { purchaseUnit: true, contentUnit: true },
      });

      await this.normalizePresentationDefaults(tx, businessId, ingredientId);
      await this.assertPresentationDefaultInvariant(
        tx,
        businessId,
        ingredientId,
      );
      return this.reloadPurchasePresentation(
        tx,
        updated.id,
        validated.ingredient.stockUnitId,
      );
    });
  }

  async deactivatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
  ) {
    if (this.isLockedPresentationId(presentationId)) {
      throw new BadRequestException(
        'Las conversiones fijas no se pueden desactivar.',
      );
    }

    return this.runPresentationTransaction(async (tx) => {
      const existing = await tx.ingredientPurchasePresentation.findFirst({
        where: { id: presentationId, businessId, ingredientId },
      });
      if (!existing)
        throw new NotFoundException('Purchase presentation not found');

      const ingredient = await tx.ingredient.findFirst({
        where: { id: ingredientId, businessId, deletedAt: null },
        select: { stockUnitId: true },
      });
      if (!ingredient) throw new NotFoundException('Ingredient not found');

      const updated = await tx.ingredientPurchasePresentation.update({
        where: { id: presentationId },
        data: { isActive: false, isDefault: false },
        include: { purchaseUnit: true, contentUnit: true },
      });

      await this.normalizePresentationDefaults(tx, businessId, ingredientId);
      await this.assertPresentationDefaultInvariant(
        tx,
        businessId,
        ingredientId,
      );

      return ingredient?.stockUnitId
        ? this.formatPurchasePresentation(tx, updated, ingredient.stockUnitId)
        : updated;
    });
  }

  private withMovementFlags<
    T extends { _count?: { inventoryMovements?: number } },
  >(ingredient: T) {
    const movementCount = ingredient._count?.inventoryMovements ?? 0;
    const { _count, ...rest } = ingredient as T & {
      _count?: { inventoryMovements?: number };
    };
    return {
      ...rest,
      hasMovements: movementCount > 0,
      canCreateInitialInventory: movementCount === 0,
    };
  }
}
