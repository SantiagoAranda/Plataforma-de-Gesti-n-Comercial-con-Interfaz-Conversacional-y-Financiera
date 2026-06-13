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

  private async getUnitByCode(code: IngredientUnit, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.unit.findUnique({ where: { code: String(code).toUpperCase() } });
  }

  private async getIngredientUnits(dto: Pick<CreateIngredientDto, 'consumptionUnit' | 'purchaseUnit'>) {
    const [stockUnit, defaultPurchaseUnit] = await Promise.all([
      this.getUnitByCode(dto.consumptionUnit),
      this.getUnitByCode(dto.purchaseUnit),
    ]);

    if (!stockUnit || !defaultPurchaseUnit) {
      return { stockUnitId: undefined, defaultPurchaseUnitId: undefined };
    }

    if (defaultPurchaseUnit.kind === UnitKind.COMMERCIAL) {
      throw new BadRequestException('defaultPurchaseUnitId cannot be commercial');
    }

    return {
      stockUnitId: stockUnit.id,
      defaultPurchaseUnitId: defaultPurchaseUnit.id,
    };
  }

  private getStandardPurchaseToConsumptionFactor(
    purchaseUnit: IngredientUnit,
    consumptionUnit: IngredientUnit,
  ) {
    if (purchaseUnit === consumptionUnit) {
      return new Prisma.Decimal(1);
    }

    const standardFactors: Partial<Record<`${IngredientUnit}:${IngredientUnit}`, string>> = {
      [`${IngredientUnit.KG}:${IngredientUnit.G}`]: '1000',
      [`${IngredientUnit.G}:${IngredientUnit.KG}`]: '0.001',
      [`${IngredientUnit.LB}:${IngredientUnit.G}`]: '500',
      [`${IngredientUnit.L}:${IngredientUnit.ML}`]: '1000',
      [`${IngredientUnit.ML}:${IngredientUnit.L}`]: '0.001',
      [`${IngredientUnit.PACKAGE}:${IngredientUnit.UNIT}`]: '6',
      [`${IngredientUnit.DOZEN}:${IngredientUnit.UNIT}`]: '12',
      [`${IngredientUnit.BOX}:${IngredientUnit.UNIT}`]: '24',
    };

    const standard = standardFactors[`${purchaseUnit}:${consumptionUnit}`];
    return standard ? new Prisma.Decimal(standard) : null;
  }

  private resolvePurchaseToConsumptionFactor(dto: CreateIngredientDto) {
    const standardFactor = this.getStandardPurchaseToConsumptionFactor(
      dto.purchaseUnit,
      dto.consumptionUnit,
    );

    if (standardFactor) {
      return standardFactor;
    }

    if (dto.purchaseToConsumptionFactor !== undefined) {
      const explicitFactor = new Prisma.Decimal(dto.purchaseToConsumptionFactor);
      if (explicitFactor.lte(0)) {
        throw new BadRequestException(
          'purchaseToConsumptionFactor must be greater than zero',
        );
      }
      return explicitFactor;
    }

    throw new BadRequestException(
      'purchaseToConsumptionFactor is required for this unit conversion',
    );
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

  async create(businessId: string, dto: CreateIngredientDto) {
    const purchaseToConsumptionFactor =
      this.resolvePurchaseToConsumptionFactor(dto);
    const unitIds = await this.getIngredientUnits(dto);

    const minStock = new Prisma.Decimal(dto.minStock ?? 0);
    if (minStock.lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
    }

    const recipeFields = this.resolveRecipeUnitFields(dto.recipeUnitLabel, dto.recipeUnitFactor);

    try {
      return await this.prisma.ingredient.create({
        data: {
          businessId,
          name: this.normalizeText(dto.name),
          consumptionUnit: dto.consumptionUnit,
          purchaseUnit: dto.purchaseUnit,
          stockUnitId: unitIds.stockUnitId,
          defaultPurchaseUnitId: unitIds.defaultPurchaseUnitId,
          purchaseToConsumptionFactor,
          customUnitLabel: dto.customUnitLabel?.trim() || null,
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

    return this.withMovementFlags(ingredient);
  }

  async update(businessId: string, id: string, dto: UpdateIngredientDto) {
    const existing = await this.findOne(businessId, id);

    if (dto.minStock !== undefined && new Prisma.Decimal(dto.minStock).lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
    }

    const finalPurchaseUnit = dto.purchaseUnit !== undefined ? dto.purchaseUnit : existing.purchaseUnit;
    const finalConsumptionUnit = dto.consumptionUnit !== undefined ? dto.consumptionUnit : existing.consumptionUnit;
    const unitIds: {
      stockUnitId?: string;
      defaultPurchaseUnitId?: string;
    } =
      dto.purchaseUnit !== undefined || dto.consumptionUnit !== undefined
        ? await this.getIngredientUnits({
            purchaseUnit: finalPurchaseUnit as IngredientUnit,
            consumptionUnit: finalConsumptionUnit as IngredientUnit,
          })
        : {};

    const standardFactor = this.getStandardPurchaseToConsumptionFactor(
      finalPurchaseUnit as IngredientUnit,
      finalConsumptionUnit as IngredientUnit,
    );

    let finalFactor: Prisma.Decimal | undefined = undefined;
    if (standardFactor) {
      finalFactor = standardFactor;
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
          consumptionUnit: dto.consumptionUnit,
          purchaseUnit: dto.purchaseUnit,
          stockUnitId: unitIds.stockUnitId,
          defaultPurchaseUnitId: unitIds.defaultPurchaseUnitId,
          customUnitLabel:
            dto.customUnitLabel === undefined
              ? undefined
              : dto.customUnitLabel.trim() || null,
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
    await this.findOne(businessId, ingredientId);
    return this.prisma.ingredientPurchasePresentation.findMany({
      where: { businessId, ingredientId, isActive: true },
      include: { purchaseUnit: true, contentUnit: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
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
    throw new BadRequestException('Las presentaciones de compra por insumo ya no están disponibles.');
    return this.prisma.$transaction(async (tx) => {
      const validated = await this.validatePresentationInput(tx, businessId, ingredientId, dto);

      if (dto.isDefault) {
        await tx.ingredientPurchasePresentation.updateMany({
          where: { businessId, ingredientId, isActive: true, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.ingredientPurchasePresentation.create({
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
    });
  }

  async updatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
    dto: UpsertPurchasePresentationDto,
  ) {
    throw new BadRequestException('Las presentaciones de compra por insumo ya no están disponibles.');
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

      return tx.ingredientPurchasePresentation.update({
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
    });
  }

  async deactivatePurchasePresentation(
    businessId: string,
    ingredientId: string,
    presentationId: string,
  ) {
    const existing = await this.prisma.ingredientPurchasePresentation.findFirst({
      where: { id: presentationId, businessId, ingredientId },
    });
    if (!existing) throw new NotFoundException('Purchase presentation not found');

    return this.prisma.ingredientPurchasePresentation.update({
      where: { id: presentationId },
      data: { isActive: false, isDefault: false },
      include: { purchaseUnit: true, contentUnit: true },
    });
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
