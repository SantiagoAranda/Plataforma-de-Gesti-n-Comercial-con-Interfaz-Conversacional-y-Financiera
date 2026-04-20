import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Ingredient,
  InventoryMovementType,
  InventoryReferenceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryInitialDto } from './dto/create-inventory-initial.dto';
import { CreateInventoryPurchaseDto } from './dto/create-inventory-purchase.dto';
import { InventoryKardexQueryDto } from './dto/inventory-kardex.query.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary.query.dto';

type InventoryRequirement = {
  ingredientId: string;
  quantity: Prisma.Decimal;
};

type ApplyInventoryMovementInput = {
  ingredientId: string;
  type: InventoryMovementType;
  quantity: number | Prisma.Decimal;
  unitCost?: number | Prisma.Decimal;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  detail?: string | null;
};

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async registerInitial(businessId: string, dto: CreateInventoryInitialDto) {
    return this.runInventoryTransaction((tx) =>
      this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        type: 'INVENTORY_INITIAL',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'MANUAL',
        detail: dto.detail ?? null,
      }),
    );
  }

  async registerPurchase(businessId: string, dto: CreateInventoryPurchaseDto) {
    return this.runInventoryTransaction((tx) =>
      this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        type: 'PURCHASE',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'PURCHASE_MANUAL',
        referenceId: dto.referenceId ?? null,
        detail: dto.detail ?? null,
      }),
    );
  }

  async registerPositiveAdjustment(
    businessId: string,
    dto: CreateInventoryAdjustmentDto,
  ) {
    return this.runInventoryTransaction((tx) =>
      this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        type: 'ADJUSTMENT_POSITIVE',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'MANUAL',
        detail: dto.detail,
      }),
    );
  }

  async registerNegativeAdjustment(
    businessId: string,
    dto: CreateInventoryAdjustmentDto,
  ) {
    return this.runInventoryTransaction((tx) =>
      this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        type: 'ADJUSTMENT_NEGATIVE',
        quantity: dto.quantity,
        referenceType: 'MANUAL',
        detail: dto.detail,
      }),
    );
  }

  async listKardex(
    businessId: string,
    ingredientId: string,
    query: InventoryKardexQueryDto,
  ) {
    await this.loadIngredientOrThrow(this.prisma, businessId, ingredientId);

    return this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        ingredientId,
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: this.parseDate(query.from, 'from') } : {}),
                ...(query.to ? { lte: this.parseDate(query.to, 'to') } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getSummary(businessId: string, query: InventorySummaryQueryDto) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        businessId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { name: 'asc' },
    });

    return ingredients.map((ingredient) => ({
      ...ingredient,
      stockValue: this.decimal(ingredient.currentStock)
        .mul(this.decimal(ingredient.averageCost))
        .toDecimalPlaces(6),
    }));
  }

  async expandItemRecipe(
    businessId: string,
    itemId: string,
    quantity: number | Prisma.Decimal,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<InventoryRequirement[]> {
    const item = await tx.item.findFirst({
      where: { id: itemId, businessId },
      include: { recipes: true },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (item.type === 'SERVICE' || item.inventoryMode === 'NONE') {
      return [];
    }

    const mandatoryRecipeLines = item.recipes.filter((recipe) => !recipe.isOptional);
    if (item.inventoryMode === 'SIMPLE' && mandatoryRecipeLines.length !== 1) {
      throw new BadRequestException('SIMPLE item has an invalid recipe');
    }

    if (item.inventoryMode === 'RECIPE_BASED' && mandatoryRecipeLines.length < 1) {
      throw new BadRequestException('RECIPE_BASED item has an invalid recipe');
    }

    const soldQuantity = this.decimal(quantity);

    return mandatoryRecipeLines.map((recipe) => ({
      ingredientId: recipe.ingredientId,
      quantity: this.decimal(recipe.quantityRequired).mul(soldQuantity),
    }));
  }

  consolidateRequirements(requirements: InventoryRequirement[]) {
    const byIngredient = new Map<string, Prisma.Decimal>();

    for (const requirement of requirements) {
      const current = byIngredient.get(requirement.ingredientId) ?? this.decimal(0);
      byIngredient.set(
        requirement.ingredientId,
        current.add(this.decimal(requirement.quantity)),
      );
    }

    return Array.from(byIngredient.entries()).map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
    }));
  }

  async validateStockAvailability(
    businessId: string,
    consumptions: InventoryRequirement[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const consolidated = this.consolidateRequirements(consumptions);
    const ingredientIds = consolidated.map((item) => item.ingredientId);

    const ingredients = await tx.ingredient.findMany({
      where: {
        businessId,
        id: { in: ingredientIds },
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
      },
    });

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException('One or more ingredients are invalid');
    }

    const ingredientById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    for (const requirement of consolidated) {
      const ingredient = ingredientById.get(requirement.ingredientId);
      if (!ingredient) {
        throw new BadRequestException('One or more ingredients are invalid');
      }

      if (this.decimal(ingredient.currentStock).lt(requirement.quantity)) {
        throw new BadRequestException(
          `Insufficient stock for ingredient ${ingredient.name}`,
        );
      }
    }

    return { ok: true, requirements: consolidated };
  }

  async applyInventoryMovement(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: ApplyInventoryMovementInput,
  ) {
    const ingredient = await this.loadIngredientOrThrow(
      tx,
      businessId,
      input.ingredientId,
    );
    const quantity = this.decimal(input.quantity);

    if (quantity.lte(0)) {
      throw new BadRequestException('quantity must be greater than zero');
    }

    if (this.requiresDetail(input.type) && !input.detail?.trim()) {
      throw new BadRequestException('detail is required for adjustments');
    }

    const previousStock = this.decimal(ingredient.currentStock);
    const previousAverageCost = this.decimal(ingredient.averageCost);
    const isInput = this.isInputMovement(input.type);

    const unitCost = isInput
      ? this.resolveInputUnitCost(input, previousAverageCost)
      : previousAverageCost;

    if (unitCost.lt(0)) {
      throw new BadRequestException('unitCost cannot be negative');
    }

    const stockAfter = isInput ? previousStock.add(quantity) : previousStock.sub(quantity);

    if (stockAfter.lt(0)) {
      throw new BadRequestException(`Insufficient stock for ingredient ${ingredient.name}`);
    }

    const totalValue = quantity.mul(unitCost).toDecimalPlaces(6);
    const averageCostAfter = isInput
      ? this.calculateWeightedAverageCost(
          previousStock,
          previousAverageCost,
          quantity,
          totalValue,
        )
      : previousAverageCost;

    const movement = await tx.inventoryMovement.create({
      data: {
        businessId,
        ingredientId: input.ingredientId,
        type: input.type,
        quantity,
        unitCost,
        totalValue,
        stockAfter,
        averageCostAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        detail: input.detail?.trim() || null,
      },
    });

    await tx.ingredient.update({
      where: { id: input.ingredientId },
      data: {
        currentStock: stockAfter,
        averageCost: averageCostAfter,
      },
    });

    return movement;
  }

  private runInventoryTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private async loadIngredientOrThrow(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    ingredientId: string,
  ): Promise<Ingredient> {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, businessId },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    return ingredient;
  }

  private calculateWeightedAverageCost(
    previousStock: Prisma.Decimal,
    previousAverageCost: Prisma.Decimal,
    inputQuantity: Prisma.Decimal,
    inputTotalValue: Prisma.Decimal,
  ) {
    const newStock = previousStock.add(inputQuantity);
    if (newStock.eq(0)) {
      return this.decimal(0);
    }

    return previousStock
      .mul(previousAverageCost)
      .add(inputTotalValue)
      .div(newStock)
      .toDecimalPlaces(6);
  }

  private resolveInputUnitCost(
    input: ApplyInventoryMovementInput,
    fallbackCost: Prisma.Decimal,
  ) {
    if (input.unitCost !== undefined && input.unitCost !== null) {
      return this.decimal(input.unitCost);
    }

    if (input.type === 'ADJUSTMENT_POSITIVE') {
      return fallbackCost;
    }

    throw new BadRequestException('unitCost is required for this movement');
  }

  private isInputMovement(type: InventoryMovementType) {
    return [
      'INVENTORY_INITIAL',
      'PURCHASE',
      'SALE_RETURN',
      'ADJUSTMENT_POSITIVE',
    ].includes(type);
  }

  private requiresDetail(type: InventoryMovementType) {
    return ['ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE'].includes(type);
  }

  private decimal(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  private parseDate(value: string, boundary: 'from' | 'to') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date filter');
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      parsed.setHours(
        boundary === 'from' ? 0 : 23,
        boundary === 'from' ? 0 : 59,
        boundary === 'from' ? 0 : 59,
        boundary === 'from' ? 0 : 999,
      );
    }

    return parsed;
  }
}
