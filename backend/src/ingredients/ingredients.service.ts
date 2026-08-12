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

  private readonly editablePresentationCodesByStockUnit: Record<string, string[]> = {
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

  private handleKnownPrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Ingredient name already exists');
    }

    throw error;
  }

  private async getUnitByCode(code: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.unit.findUnique({ where: { code: String(code).toUpperCase() } });
  }

  private async getUnitById(id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
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
    existing?: { recipeUnitLabel: string | null; recipeUnitFactor: Prisma.Decimal | null },
  ) {
    const label = recipeUnitLabelInput !== undefined
      ? (recipeUnitLabelInput?.trim() || null)
      : (existing ? existing.recipeUnitLabel : null);

    const factorStr = recipeUnitFactorInput !== undefined
      ? recipeUnitFactorInput
      : (existing && existing.recipeUnitFactor ? existing.recipeUnitFactor.toString() : null);

    if (label && !factorStr) {
      throw new BadRequestException('recipeUnitFactor is required when recipeUnitLabel is provided');
    }
    if (!label && factorStr) {
      throw new BadRequestException('recipeUnitLabel is required when recipeUnitFactor is provided');
    }

    if (label && factorStr) {
      const factor = new Prisma.Decimal(factorStr);
      if (factor.lte(0)) {
        throw new BadRequestException('recipeUnitFactor must be greater than zero');
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
        presentation.purchaseUnit?.symbol || presentation.purchaseUnit?.name || presentation.name,
      factorToBaseUnit,
      isLocked: false,
    };
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

    const fromCodes = this.fixedPurchaseConversionCodes[ingredient.stockUnit.code] ?? [];
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
      ? this.editablePresentationCodesByStockUnit[stockCode] ?? []
      : [];

    if (!allowedCodes.includes(purchaseUnit.code)) {
      throw new BadRequestException(
        'La presentación de compra no está permitida para la unidad base del insumo.',
      );
    }
  }

  async create(businessId: string, dto: CreateIngredientDto) {
    const units = await this.resolveIngredientUnits(dto);

    const minStock = new Prisma.Decimal(dto.minStock ?? 0);
    if (minStock.lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
    }

    const recipeFields = this.resolveRecipeUnitFields(dto.recipeUnitLabel, dto.recipeUnitFactor);

    let finalFactor = units.purchaseToConsumptionFactor;
    if (dto.purchaseToConsumptionFactor !== undefined) {
      const explicitFactor = new Prisma.Decimal(dto.purchaseToConsumptionFactor);
      if (explicitFactor.lte(0)) {
        throw new BadRequestException(
          'purchaseToConsumptionFactor must be greater than zero',
        );
      }
      const isWeightOrVolume =
        (units.stockUnit.kind === UnitKind.WEIGHT && units.defaultPurchaseUnit.kind === UnitKind.WEIGHT) ||
        (units.stockUnit.kind === UnitKind.VOLUME && units.defaultPurchaseUnit.kind === UnitKind.VOLUME);

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
      where: { id, businessId },
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
            this.formatPurchasePresentation(this.prisma, presentation, ingredient.stockUnitId!),
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

    if (dto.minStock !== undefined && new Prisma.Decimal(dto.minStock).lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
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
      const explicitFactor = new Prisma.Decimal(dto.purchaseToConsumptionFactor);
      if (explicitFactor.lte(0)) {
        throw new BadRequestException(
          'purchaseToConsumptionFactor must be greater than zero',
        );
      }
      finalFactor = explicitFactor;
    }

    const recipeFields = (dto.recipeUnitLabel !== undefined || dto.recipeUnitFactor !== undefined)
      ? this.resolveRecipeUnitFields(dto.recipeUnitLabel, dto.recipeUnitFactor, existing)
      : undefined;

    try {
      return await this.prisma.ingredient.update({
        where: { id },
        data: {
          name: dto.name === undefined ? undefined : this.normalizeText(dto.name),
          status: dto.status,
          consumptionUnit: units
            ? this.toLegacyIngredientUnit(units.stockUnit.code, units.stockUnit.code)
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
            dto.minStock === undefined ? undefined : new Prisma.Decimal(dto.minStock),
          recipeUnitLabel: recipeFields === undefined ? undefined : recipeFields.recipeUnitLabel,
          recipeUnitFactor: recipeFields === undefined ? undefined : recipeFields.recipeUnitFactor,
        },
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
    }
  }

  async deactivate(businessId: string, id: string) {
    await this.findOne(businessId, id);

    return this.prisma.ingredient.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
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

  async listPurchasePresentations(businessId: string, ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
      include: { stockUnit: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    if (!ingredient.stockUnitId) {
      throw new BadRequestException('Ingredient must have stockUnitId before configuring purchase presentations');
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
        this.formatPurchasePresentation(this.prisma, presentation, ingredient.stockUnitId!),
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
      where: { id: ingredientId, businessId },
      include: { stockUnit: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    if (!ingredient.stockUnitId) {
      throw new BadRequestException('Ingredient must have stockUnitId before configuring purchase presentations');
    }

    const innerQuantity = new Prisma.Decimal(dto.innerQuantity);
    const contentQuantity = new Prisma.Decimal(dto.contentQuantity);
    if (innerQuantity.lte(0)) throw new BadRequestException('innerQuantity must be greater than zero');
    if (contentQuantity.lte(0)) throw new BadRequestException('contentQuantity must be greater than zero');

    const [purchaseUnit, contentUnit] = await Promise.all([
      tx.unit.findUnique({ where: { id: dto.purchaseUnitId } }),
      tx.unit.findUnique({ where: { id: dto.contentUnitId } }),
    ]);

    if (!purchaseUnit || purchaseUnit.kind !== UnitKind.COMMERCIAL) {
      throw new BadRequestException('purchaseUnitId must reference a commercial unit');
    }
    this.ensureEditablePresentationAllowed(ingredient, purchaseUnit);
    if (!contentUnit || contentUnit.kind === UnitKind.COMMERCIAL) {
      throw new BadRequestException('contentUnitId must reference a standard unit');
    }

    const conversion = await tx.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: dto.contentUnitId,
          toUnitId: ingredient.stockUnitId,
        },
      },
      include: { fromUnit: true, toUnit: true },
    });
    if (!conversion) {
      throw new BadRequestException('contentUnit must be convertible to ingredient stock unit');
    }
    if (conversion.fromUnit.kind === UnitKind.COMMERCIAL || conversion.toUnit.kind === UnitKind.COMMERCIAL) {
      throw new BadRequestException('UnitConversion cannot use commercial units');
    }

    return { ingredient, innerQuantity, contentQuantity };
  }

  async createPurchasePresentation(
    businessId: string,
    ingredientId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const validated = await this.validatePresentationInput(tx, businessId, ingredientId, dto);

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
          isActive: true,
        },
      });

      if (existing) {
        const updated = await tx.ingredientPurchasePresentation.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            innerQuantity: validated.innerQuantity,
            innerUnitLabel: dto.innerUnitLabel?.trim() || null,
            contentQuantity: validated.contentQuantity,
            contentUnitId: dto.contentUnitId,
            isDefault: !!dto.isDefault,
            isActive: dto.isActive ?? true,
          },
          include: { purchaseUnit: true, contentUnit: true },
        });

        return this.formatPurchasePresentation(tx, updated, validated.ingredient.stockUnitId!);
      }

      const created = await tx.ingredientPurchasePresentation.create({
        data: {
          businessId,
          ingredientId,
          name: dto.name.trim(),
          purchaseUnitId: dto.purchaseUnitId,
          innerQuantity: validated.innerQuantity,
          innerUnitLabel: dto.innerUnitLabel?.trim() || null,
          contentQuantity: validated.contentQuantity,
          contentUnitId: dto.contentUnitId,
          isDefault: !!dto.isDefault,
          isActive: dto.isActive ?? true,
        },
        include: { purchaseUnit: true, contentUnit: true },
      });

      return this.formatPurchasePresentation(tx, created, validated.ingredient.stockUnitId!);
    });
  }

  async updatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    if (this.isLockedPresentationId(presentationId)) {
      throw new BadRequestException('Las conversiones fijas no se pueden editar.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ingredientPurchasePresentation.findFirst({
        where: { id: presentationId, businessId, ingredientId },
      });
      if (!existing) throw new NotFoundException('Purchase presentation not found');

      const validated = await this.validatePresentationInput(tx, businessId, ingredientId, dto);

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
          innerUnitLabel: dto.innerUnitLabel?.trim() || null,
          contentQuantity: validated.contentQuantity,
          contentUnitId: dto.contentUnitId,
          isDefault: !!dto.isDefault,
          isActive: dto.isActive ?? true,
        },
        include: { purchaseUnit: true, contentUnit: true },
      });

      return this.formatPurchasePresentation(tx, updated, validated.ingredient.stockUnitId!);
    });
  }

  async deactivatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
  ) {
    if (this.isLockedPresentationId(presentationId)) {
      throw new BadRequestException('Las conversiones fijas no se pueden desactivar.');
    }

    const existing = await this.prisma.ingredientPurchasePresentation.findFirst({
      where: { id: presentationId, businessId, ingredientId },
    });
    if (!existing) throw new NotFoundException('Purchase presentation not found');

    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
      select: { stockUnitId: true },
    });

    const updated = await this.prisma.ingredientPurchasePresentation.update({
      where: { id: presentationId },
      data: { isActive: false, isDefault: false },
      include: { purchaseUnit: true, contentUnit: true },
    });

    return ingredient?.stockUnitId
      ? this.formatPurchasePresentation(this.prisma, updated, ingredient.stockUnitId)
      : updated;
  }

  private withMovementFlags<T extends { _count?: { inventoryMovements?: number } }>(
    ingredient: T,
  ) {
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
