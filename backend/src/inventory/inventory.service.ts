import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingMovementOriginType,
  Ingredient,
  InventoryMovementType,
  InventoryReferenceType,
  Item,
  MovementNature,
  Prisma,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryInitialDto } from './dto/create-inventory-initial.dto';
import { CreateInventoryPurchaseDto } from './dto/create-inventory-purchase.dto';
import { CreateInventoryPurchaseReturnDto } from './dto/create-inventory-purchase-return.dto';
import { InventoryKardexGlobalQueryDto } from './dto/inventory-kardex-global.query.dto';
import { InventoryKardexQueryDto } from './dto/inventory-kardex.query.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary.query.dto';

type InventoryRequirement = {
  ingredientId?: string;
  itemId?: string;
  itemName?: string;
  quantity: Prisma.Decimal;
};

type OrderItemForInventory = {
  id: string;
  itemId: string;
  quantity: number;
  itemNameSnapshot: string;
  itemTypeSnapshot: string;
  inventoryModeSnapshot?: string | null;
  excludedOptionalIngredientIds?: unknown;
  item?: {
    inventoryMode?: string | null;
  } | null;
};

type OrderForInventory = {
  id: string;
  origin?: string | null;
  inventoryPostedAt?: Date | null;
  items: OrderItemForInventory[];
};

type OrderIngredientConsumption = InventoryRequirement & {
  orderItemId: string;
  soldItemId: string;
  itemName: string;
};

type ApplyInventoryMovementInput = {
  ingredientId?: string | null;
  itemId?: string | null;
  type: InventoryMovementType;
  quantity: number | string | Prisma.Decimal;
  unitCost?: number | string | Prisma.Decimal;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  detail?: string | null;
};

type StockTarget =
  | { kind: 'ingredient'; ingredient: Ingredient }
  | { kind: 'item'; item: Item; currentStock: Prisma.Decimal; averageCost: Prisma.Decimal };

export type ItemSellabilityStatus =
  | 'SELLABLE'
  | 'NO_STOCK'
  | 'LOW_STOCK'
  | 'MISSING_INITIAL_STOCK'
  | 'MISSING_RECIPE'
  | 'EMPTY_RECIPE'
  | 'INSUFFICIENT_RECIPE_STOCK'
  | 'INACTIVE';

export type ItemSellability = {
  sellable: boolean;
  status: ItemSellabilityStatus;
  message?: string;
  currentStock?: Prisma.Decimal;
  averageCost?: Prisma.Decimal;
  missingItems?: Array<{
    id: string;
    name: string;
    required: Prisma.Decimal;
    available: Prisma.Decimal;
    unit?: string | null;
  }>;
};

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private accountingService?: AccountingService,
  ) {}

  async registerInitial(businessId: string, dto: CreateInventoryInitialDto) {
    return this.runInventoryTransaction(async (tx) => {
      await this.assertCanCreateInitialInventory(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
      });

      return this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'INVENTORY_INITIAL',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'MANUAL',
        detail: dto.detail ?? null,
      });
    });
  }

  async registerPurchase(businessId: string, dto: CreateInventoryPurchaseDto) {
    return this.runInventoryTransaction(async (tx) => {
      const { quantity, unitCost } = await this.resolvePurchaseInput(
        tx,
        businessId,
        dto,
      );

      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'PURCHASE',
        quantity,
        unitCost,
        referenceType: 'PURCHASE_MANUAL',
        referenceId: dto.referenceId ?? null,
        detail: dto.detail ?? null,
      });

      await this.postManualInventoryAccounting(tx, businessId, movement);

      return movement;
    });
  }

  async registerPurchaseReturn(
    businessId: string,
    dto: CreateInventoryPurchaseReturnDto,
  ) {
    return this.runInventoryTransaction(async (tx) => {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'PURCHASE_RETURN',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'PURCHASE_MANUAL',
        referenceId: dto.referenceId ?? null,
        detail: dto.detail ?? null,
      });

      await this.postManualInventoryAccounting(tx, businessId, movement);

      return movement;
    });
  }

  async registerPositiveAdjustment(
    businessId: string,
    dto: CreateInventoryAdjustmentDto,
  ) {
    return this.runInventoryTransaction(async (tx) => {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'ADJUSTMENT_POSITIVE',
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        referenceType: 'MANUAL',
        detail: dto.detail,
      });

      await this.postManualInventoryAccounting(tx, businessId, movement);

      return movement;
    });
  }

  async registerNegativeAdjustment(
    businessId: string,
    dto: CreateInventoryAdjustmentDto,
  ) {
    return this.runInventoryTransaction(async (tx) => {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'ADJUSTMENT_NEGATIVE',
        quantity: dto.quantity,
        referenceType: 'MANUAL',
        detail: dto.detail,
      });

      await this.postManualInventoryAccounting(tx, businessId, movement);

      return movement;
    });
  }

  async reconcileIngredient(businessId: string, ingredientId: string) {
    return this.runInventoryTransaction(async (tx) => {
      const ingredient = await this.loadIngredientOrThrow(
        tx,
        businessId,
        ingredientId,
      );

      const movements = await tx.inventoryMovement.findMany({
        where: { businessId, ingredientId },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      });

      let currentStock = this.decimal(0);
      let averageCost = this.decimal(0);

      for (const movement of movements) {
        const quantity = this.decimal(movement.quantity);
        const unitCost = this.decimal(movement.unitCost);
        const stockIncrease = this.isStockIncrease(movement.type);
        const stockAfter = stockIncrease
          ? currentStock.add(quantity)
          : currentStock.sub(quantity);

        if (stockAfter.lt(0)) {
          throw new BadRequestException(
            `Cannot reconcile ingredient ${ingredient.name}: historical movement would make stock negative`,
          );
        }

        averageCost = this.recalculatesAverageCost(movement.type)
          ? this.calculateAverageCostAfter({
              type: movement.type,
              previousStock: currentStock,
              previousAverageCost: averageCost,
              quantity,
              unitCost,
              stockAfter,
            })
          : averageCost;

        currentStock = stockAfter;
      }

      await tx.ingredient.update({
        where: { id: ingredientId },
        data: {
          currentStock,
          averageCost,
        },
      });

      return {
        ingredientId,
        previousStock: this.decimal(ingredient.currentStock),
        previousAverageCost: this.decimal(ingredient.averageCost),
        recalculatedStock: currentStock,
        recalculatedAverageCost: averageCost,
        movementsProcessed: movements.length,
      };
    });
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

  async listItemKardex(
    businessId: string,
    itemId: string,
    query: InventoryKardexQueryDto,
  ) {
    await this.loadSimpleItemOrThrow(this.prisma, businessId, itemId);

    return this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        itemId,
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

  async listGlobalKardex(businessId: string, query: InventoryKardexGlobalQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    const occurredAtFilter =
      query.dateFrom || query.dateTo
        ? {
            occurredAt: {
              ...(query.dateFrom
                ? { gte: this.parseDate(query.dateFrom, 'from') }
                : {}),
              ...(query.dateTo ? { lte: this.parseDate(query.dateTo, 'to') } : {}),
            },
          }
        : {};

    const where: Prisma.InventoryMovementWhereInput = {
      businessId,
      ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(occurredAtFilter as any),
    };

    const [total, movements] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          ingredient: {
            select: { id: true, name: true, consumptionUnit: true },
          },
          item: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: movements,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getSummary(businessId: string, query: InventorySummaryQueryDto) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        businessId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { _count: { select: { inventoryMovements: true } } },
      orderBy: { name: 'asc' },
    });

    return ingredients.map((ingredient) => {
      const { _count, ...rest } = ingredient;
      const movementCount = _count?.inventoryMovements ?? 0;

      return {
        ...rest,
        stockValue: this.decimal(rest.currentStock)
          .mul(this.decimal(rest.averageCost))
          .toDecimalPlaces(6),
        outOfStock: this.decimal(rest.currentStock).lte(0),
        lowStock:
          this.decimal(rest.minStock ?? 0).gt(0) &&
          this.decimal(rest.currentStock).gt(0) &&
          this.decimal(rest.currentStock).lte(this.decimal(rest.minStock ?? 0)),
        hasMovements: movementCount > 0,
        canCreateInitialInventory: movementCount === 0,
      };
    });
  }

  async getSimpleItemStockState(
    businessId: string,
    itemId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const state = await this.getItemStockState(tx, businessId, itemId);
    return {
      itemId,
      currentStock: state.currentStock,
      averageCost: state.averageCost,
      stockValue: state.currentStock.mul(state.averageCost).toDecimalPlaces(6),
      outOfStock: state.currentStock.lte(0),
    };
  }

  async getSimpleItemsSummary(businessId: string) {
    const items = await this.prisma.item.findMany({
      where: { businessId, type: 'PRODUCT', inventoryMode: 'SIMPLE' },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      items.map(async (item) => {
        const state = await this.getSimpleItemStockState(businessId, item.id);
        const sellability = await this.getItemSellability(businessId, item.id);
        const movementCount = await this.prisma.inventoryMovement.count({
          where: { businessId, itemId: item.id },
        });
        return {
          ...item,
          currentStock: state.currentStock,
          averageCost: state.averageCost,
          stockValue: state.stockValue,
          outOfStock: state.outOfStock,
          sellability,
          hasMovements: movementCount > 0,
          canCreateInitialInventory: movementCount === 0,
        };
      }),
    );
  }

  private getPurchaseToStockFactor(ingredient: {
    purchaseUnit: string;
    consumptionUnit: string;
    purchaseToConsumptionFactor: Prisma.Decimal | number | string;
  }) {
    if (ingredient.purchaseUnit === ingredient.consumptionUnit) {
      return this.decimal(ingredient.purchaseToConsumptionFactor ?? 1);
    }

    const standardFactors: Record<string, string> = {
      'KG:G': '1000',
      'G:KG': '0.001',
      'L:ML': '1000',
      'ML:L': '0.001',
    };
    const standard = standardFactors[`${ingredient.purchaseUnit}:${ingredient.consumptionUnit}`];
    if (standard) return this.decimal(standard);

    return this.decimal(ingredient.purchaseToConsumptionFactor);
  }

  async getItemSellability(
    businessId: string,
    itemId: string,
    quantity: number | string | Prisma.Decimal = 1,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ItemSellability> {
    const item = await tx.item.findFirst({
      where: { id: itemId, businessId },
      include: {
        recipes: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                currentStock: true,
                consumptionUnit: true,
                customUnitLabel: true,
              },
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (item.status !== 'ACTIVE') {
      return { sellable: false, status: 'INACTIVE', message: `${item.name} no está activo.` };
    }

    if (item.type === 'SERVICE' || item.inventoryMode === 'NONE') {
      return { sellable: true, status: 'SELLABLE' };
    }

    const requiredQuantity = this.decimal(quantity);

    if (item.inventoryMode === 'SIMPLE') {
      const movementCount = await tx.inventoryMovement.count({
        where: {
          businessId,
          itemId: item.id,
          type: { in: ['INVENTORY_INITIAL', 'PURCHASE'] },
        },
      });
      const state = await this.getItemStockState(tx, businessId, item.id);

      if (movementCount === 0) {
        return {
          sellable: false,
          status: 'MISSING_INITIAL_STOCK',
          message: `${item.name} no tiene inventario inicial.`,
          currentStock: state.currentStock,
          averageCost: state.averageCost,
        };
      }

      if (state.currentStock.lte(0)) {
        return {
          sellable: false,
          status: 'NO_STOCK',
          message: `${item.name} no tiene stock disponible.`,
          currentStock: state.currentStock,
          averageCost: state.averageCost,
        };
      }

      if (state.currentStock.lt(requiredQuantity)) {
        return {
          sellable: false,
          status: 'NO_STOCK',
          message: `Stock insuficiente para ${item.name}. Disponible: ${state.currentStock.toString()}, requerido: ${requiredQuantity.toString()}.`,
          currentStock: state.currentStock,
          averageCost: state.averageCost,
        };
      }

      const minStockValue = this.decimal(item.minStock ?? 0);
      const isLowStock = minStockValue.gt(0) && state.currentStock.lte(minStockValue);

      return {
        sellable: true,
        status: isLowStock ? 'LOW_STOCK' : 'SELLABLE',
        message: isLowStock ? `${item.name} tiene stock bajo.` : undefined,
        currentStock: state.currentStock,
        averageCost: state.averageCost,
      };
    }

    const mandatoryLines = item.recipes.filter((line) => !line.isOptional);
    if (!item.recipes.length || !mandatoryLines.length) {
      return {
        sellable: false,
        status: 'MISSING_RECIPE',
        message: `${item.name} usa inventario por receta, pero no tiene receta configurada.`,
      };
    }

    let virtualStock: Prisma.Decimal | null = null;
    const missingItems: any[] = [];

    for (const line of mandatoryLines) {
      const available = this.decimal(line.ingredient.currentStock);
      const reqPerUnit = this.decimal(line.quantityRequired);
      
      const maxUnits = reqPerUnit.gt(0) ? available.div(reqPerUnit) : this.decimal(Infinity);
      if (virtualStock === null || maxUnits.lt(virtualStock)) {
        virtualStock = maxUnits;
      }

      const requiredForQuantity = reqPerUnit.mul(requiredQuantity);
      if (available.lt(requiredForQuantity)) {
        missingItems.push({
          id: line.ingredientId,
          name: line.ingredient.name,
          required: requiredForQuantity,
          available,
          unit: line.ingredient.customUnitLabel ?? line.ingredient.consumptionUnit,
        });
      }
    }

    if (missingItems.length) {
      const availableUnits = virtualStock ? Math.floor(virtualStock.toNumber()) : 0;
      if (availableUnits <= 0) {
        return {
          sellable: false,
          status: 'INSUFFICIENT_RECIPE_STOCK',
          message: `${item.name} no tiene stock disponible.`,
          missingItems,
        };
      } else {
        return {
          sellable: false,
          status: 'INSUFFICIENT_RECIPE_STOCK',
          message: `Stock insuficiente para ${item.name}. Disponible: ${availableUnits}, requerido: ${requiredQuantity.toString()}.`,
          missingItems,
        };
      }
    }

    return { sellable: true, status: 'SELLABLE' };
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

    const soldQuantity = this.decimal(quantity);

    if (item.inventoryMode === 'SIMPLE') {
      return [
        {
          itemId: item.id,
          itemName: item.name,
          quantity: soldQuantity,
        },
      ];
    }

    const mandatoryRecipeLines = item.recipes.filter((recipe) => !recipe.isOptional);
    if (item.inventoryMode === 'RECIPE_BASED' && mandatoryRecipeLines.length < 1) {
      throw new BadRequestException('RECIPE_BASED item has an invalid recipe');
    }

    return mandatoryRecipeLines.map((recipe) => ({
      ingredientId: recipe.ingredientId,
      quantity: this.decimal(recipe.quantityRequired).mul(soldQuantity),
    }));
  }

  consolidateRequirements(requirements: InventoryRequirement[]) {
    const byTarget = new Map<string, InventoryRequirement>();

    for (const requirement of requirements) {
      const key = requirement.ingredientId
        ? `ingredient:${requirement.ingredientId}`
        : `item:${requirement.itemId}`;
      const current = byTarget.get(key);
      byTarget.set(key, {
        ...requirement,
        quantity: (current?.quantity ?? this.decimal(0)).add(
          this.decimal(requirement.quantity),
        ),
      });
    }

    return Array.from(byTarget.values());
  }

  async validateStockAvailability(
    businessId: string,
    consumptions: InventoryRequirement[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const consolidated = this.consolidateRequirements(consumptions);
    const ingredientRequirements = consolidated.filter(
      (item) => item.ingredientId,
    );
    const itemRequirements = consolidated.filter((item) => item.itemId);
    const ingredientIds = ingredientRequirements.map((item) => item.ingredientId!);
    const itemIds = itemRequirements.map((item) => item.itemId!);

    if (ingredientIds.length === 0 && itemIds.length === 0) {
      return { ok: true, requirements: consolidated };
    }

    const ingredients = ingredientIds.length
      ? await tx.ingredient.findMany({
          where: {
            businessId,
            id: { in: ingredientIds },
          },
          select: {
            id: true,
            name: true,
            currentStock: true,
          },
        })
      : [];

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException('One or more ingredients are invalid');
    }

    const ingredientById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    for (const requirement of ingredientRequirements) {
      const ingredient = ingredientById.get(requirement.ingredientId!);
      if (!ingredient) {
        throw new BadRequestException('One or more ingredients are invalid');
      }

      if (this.decimal(ingredient.currentStock).lt(requirement.quantity)) {
        throw new BadRequestException(
          `Insufficient stock for ingredient ${ingredient.name}`,
        );
      }
    }

    for (const requirement of itemRequirements) {
      const state = await this.getItemStockState(
        tx,
        businessId,
        requirement.itemId!,
      );
      if (!state.item) {
        throw new BadRequestException('One or more items are invalid');
      }
      if (state.currentStock.lt(requirement.quantity)) {
        throw new BadRequestException(
          `Stock insuficiente para ${state.item.name}. Disponible: ${state.currentStock.toString()}, requerido: ${requirement.quantity.toString()}.`,
        );
      }
    }

    return { ok: true, requirements: consolidated };
  }

  async applyInventoryConsumptionForOrder(
    tx: Prisma.TransactionClient,
    businessId: string,
    order: OrderForInventory,
    occurredAt: Date = new Date(),
    diagnosticContext: { sourceType?: string } = {},
  ) {
    if (order.inventoryPostedAt) {
      return [];
    }

    const consumptions = await this.expandOrderItemsToIngredients(
      tx,
      businessId,
      order.items,
      {
        orderId: order.id,
        sourceType: diagnosticContext.sourceType ?? 'ORDER',
      },
    );
    await this.validateStockAvailability(businessId, consumptions, tx);

    const movements = [];
    for (const consumption of consumptions) {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: consumption.ingredientId,
        itemId: consumption.itemId,
        type: 'SALE',
        quantity: consumption.quantity,
        referenceType: 'ORDER_ITEM',
        orderId: order.id,
        orderItemId: consumption.orderItemId,
        detail: `Sale item ${consumption.itemName}`,
      });
      movements.push(movement);
    }

    await tx.order.update({
      where: { id: order.id },
      data: { inventoryPostedAt: occurredAt },
    });

    return movements;
  }

  async reverseInventoryConsumptionForOrder(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: { orderId: string; reason?: string },
  ) {
    const saleMovements = await tx.inventoryMovement.findMany({
      where: {
        businessId,
        orderId: input.orderId,
        type: 'SALE',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!saleMovements.length) {
      const existingReturn = await tx.inventoryMovement.findMany({
        where: {
          businessId,
          orderId: input.orderId,
          type: 'SALE_RETURN',
        },
        take: 1,
        select: { id: true },
      });

      if (existingReturn.length) {
        throw new ConflictException('Order inventory already reversed');
      }

      return [];
    }

    const existingReturns = await tx.inventoryMovement.findMany({
      where: {
        businessId,
        orderId: input.orderId,
        type: 'SALE_RETURN',
      },
      select: {
        ingredientId: true,
        itemId: true,
        orderItemId: true,
      },
    });

    const movementKey = (m: {
      ingredientId?: string | null;
      itemId?: string | null;
      orderItemId: string | null;
    }) =>
      `${m.ingredientId ? `ingredient:${m.ingredientId}` : `item:${m.itemId}`}::${m.orderItemId ?? 'null'}`;

    const existingKeys = new Set(existingReturns.map(movementKey));
    const saleKeys = saleMovements.map(movementKey);

    if (existingKeys.size) {
      const allAlreadyReturned = saleKeys.every((key) => existingKeys.has(key));
      throw new ConflictException(
        allAlreadyReturned
          ? 'Order inventory already reversed'
          : 'Order inventory reversal is partially applied',
      );
    }

    const ingredientIds = Array.from(
      new Set(
        saleMovements
          .map((movement) => movement.ingredientId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const itemIds = Array.from(
      new Set(
        saleMovements
          .map((movement) => movement.itemId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const ingredients = await tx.ingredient.findMany({
      where: {
        businessId,
        id: { in: ingredientIds },
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
        averageCost: true,
      },
    });

    if (ingredients.length !== ingredientIds.length) {
      throw new NotFoundException('Ingredient not found for return movement');
    }

    const itemStates = new Map<
      string,
      { name: string; currentStock: Prisma.Decimal; averageCost: Prisma.Decimal }
    >();
    for (const itemId of itemIds) {
      const state = await this.getItemStockState(tx, businessId, itemId);
      itemStates.set(itemId, {
        name: state.item.name,
        currentStock: state.currentStock,
        averageCost: state.averageCost,
      });
    }

    const ingredientState = new Map(
      ingredients.map((ingredient) => [
        ingredient.id,
        {
          name: ingredient.name,
          currentStock: this.decimal(ingredient.currentStock),
          averageCost: this.decimal(ingredient.averageCost),
        },
      ]),
    );

    const detail =
      input.reason?.trim() || 'Sale return generated from order reversal';

    const created = [];
    for (const movement of saleMovements) {
      const state = movement.ingredientId
        ? ingredientState.get(movement.ingredientId)
        : itemStates.get(movement.itemId!);
      if (!state) {
        throw new NotFoundException(
          `Inventory target not found for return movement (${movement.id})`,
        );
      }

      const key = movementKey(movement);
      if (existingKeys.has(key)) {
        continue;
      }

      const quantity = this.decimal(movement.quantity);
      const stockAfter = state.currentStock.add(quantity);

      const createdMovement = await tx.inventoryMovement.create({
        data: {
          businessId,
          ingredientId: movement.ingredientId ?? null,
          itemId: movement.itemId ?? null,
          type: 'SALE_RETURN',
          quantity,
          unitCost: movement.unitCost,
          totalValue: movement.totalValue,
          stockAfter,
          averageCostAfter: state.averageCost,
          referenceType: 'ORDER_ITEM',
          referenceId: null,
          orderId: movement.orderId,
          orderItemId: movement.orderItemId,
          detail,
        },
      });

      if (movement.ingredientId) {
        await tx.ingredient.update({
          where: { id: movement.ingredientId },
          data: {
            currentStock: stockAfter,
          },
        });
      }

      state.currentStock = stockAfter;
      existingKeys.add(key);
      created.push(createdMovement);
    }

    return created;
  }

  async expandOrderItemsToIngredients(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    orderItems: OrderItemForInventory[],
    diagnosticContext: { orderId?: string; sourceType?: string } = {},
  ): Promise<OrderIngredientConsumption[]> {
    const consumptions: OrderIngredientConsumption[] = [];

    for (const orderItem of orderItems) {
      if (orderItem.itemTypeSnapshot === 'SERVICE') {
        continue;
      }

      const inventoryMode =
        orderItem.inventoryModeSnapshot ?? orderItem.item?.inventoryMode ?? 'NONE';

      const baseLog = {
        orderId: diagnosticContext.orderId,
        sourceType: diagnosticContext.sourceType ?? 'ORDER',
        itemId: orderItem.itemId,
        itemName: orderItem.itemNameSnapshot,
        inventoryMode,
        quantitySold: orderItem.quantity,
      };

      // TODO(inventory-audit): remove temporary sale inventory diagnostic logs after production verification.
      console.log('[InventoryService] Sale inventory item', baseLog);

      if (inventoryMode === 'NONE') {
        console.log('[InventoryService] Sale inventory skip', {
          ...baseLog,
          reason: 'inventoryMode NONE',
        });
        continue;
      }

      if (!['SIMPLE', 'RECIPE_BASED'].includes(inventoryMode)) {
        throw new BadRequestException('Item cannot consume inventory');
      }

      if (inventoryMode === 'SIMPLE') {
        const sellability = await this.getItemSellability(
          businessId,
          orderItem.itemId,
          orderItem.quantity,
          tx,
        );
        if (!sellability.sellable) {
          throw new BadRequestException(sellability.message ?? 'Producto no vendible');
        }

        console.log('[InventoryService] Sale inventory SIMPLE direct stock', {
          ...baseLog,
          recipeFound: 'not_looked_up',
          calculatedConsumption: [
            { itemId: orderItem.itemId, quantity: orderItem.quantity },
          ],
        });

        consumptions.push({
          orderItemId: orderItem.id,
          soldItemId: orderItem.itemId,
          itemName: orderItem.itemNameSnapshot,
          itemId: orderItem.itemId,
          quantity: this.decimal(orderItem.quantity),
        });
        continue;
      }

      const recipe = await tx.recipe.findMany({
        where: {
          businessId,
          itemId: orderItem.itemId,
        },
        include: {
          ingredient: {
            select: { id: true },
          },
        },
      });
      const mandatoryLines = recipe.filter((line) => !line.isOptional);

      console.log('[InventoryService] Sale inventory recipe lookup', {
        ...baseLog,
        recipeFound: recipe.length > 0,
        recipeLines: recipe.length,
        mandatoryLines: mandatoryLines.length,
      });

      if (inventoryMode === 'RECIPE_BASED' && mandatoryLines.length < 1) {
        throw new BadRequestException(
          `El producto ${orderItem.itemNameSnapshot} usa inventario por receta, pero no tiene receta configurada.`,
        );
      }

      const excludedOptionalIngredientIds = new Set(
        this.parseExcludedOptionalIngredientIds(
          orderItem.excludedOptionalIngredientIds,
        ),
      );
      const consumableLines =
        recipe.filter(
          (line) =>
            !line.isOptional ||
            !excludedOptionalIngredientIds.has(line.ingredientId),
        );

      console.log('[InventoryService] Sale inventory calculated consumption', {
        ...baseLog,
        excludedOptionalIngredientIds: Array.from(excludedOptionalIngredientIds),
        calculatedConsumption: consumableLines.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: this.decimal(line.quantityRequired)
            .mul(orderItem.quantity)
            .toString(),
          isOptional: line.isOptional,
        })),
      });

      for (const line of consumableLines) {
        consumptions.push({
          orderItemId: orderItem.id,
          soldItemId: orderItem.itemId,
          itemName: orderItem.itemNameSnapshot,
          ingredientId: line.ingredientId,
          quantity: this.decimal(line.quantityRequired).mul(orderItem.quantity),
        });
      }
    }

    return consumptions;
  }

  async applyInventoryMovement(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: ApplyInventoryMovementInput,
  ) {
    const target = await this.resolveMovementTarget(tx, businessId, input);
    const quantity = this.decimal(input.quantity);

    if (quantity.lte(0)) {
      throw new BadRequestException('quantity must be greater than zero');
    }

    if (this.requiresDetail(input.type) && !input.detail?.trim()) {
      throw new BadRequestException('detail is required for adjustments');
    }

    const targetName =
      target.kind === 'ingredient' ? target.ingredient.name : target.item.name;
    const previousStock =
      target.kind === 'ingredient'
        ? this.decimal(target.ingredient.currentStock)
        : target.currentStock;
    const previousAverageCost =
      target.kind === 'ingredient'
        ? this.decimal(target.ingredient.averageCost)
        : target.averageCost;

    const stockIncrease = this.isStockIncrease(input.type);
    const stockAfter = stockIncrease
      ? previousStock.add(quantity)
      : previousStock.sub(quantity);

    if (stockAfter.lt(0)) {
      if (target.kind === 'item') {
        throw new BadRequestException(
          `Stock insuficiente para ${target.item.name}. Disponible: ${previousStock.toString()}, requerido: ${quantity.toString()}.`,
        );
      }

      throw new BadRequestException(`Insufficient stock for ingredient ${targetName}`);
    }

    const unitCost = this.resolveMovementUnitCost(input, previousAverageCost);

    if (unitCost.lt(0)) {
      throw new BadRequestException('unitCost cannot be negative');
    }

    const totalValue = quantity.mul(unitCost).toDecimalPlaces(6);

    const averageCostAfter = this.recalculatesAverageCost(input.type)
      ? this.calculateAverageCostAfter({
          type: input.type,
          previousStock,
          previousAverageCost,
          quantity,
          unitCost,
          stockAfter,
        })
      : previousAverageCost;

    const movement = await tx.inventoryMovement.create({
      data: {
        businessId,
        ingredientId:
          target.kind === 'ingredient' ? target.ingredient.id : null,
        itemId: target.kind === 'item' ? target.item.id : null,
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
      include: {
        ingredient: true,
        item: true,
      },
    });

    if (target.kind === 'ingredient') {
      await tx.ingredient.update({
        where: { id: target.ingredient.id },
        data: {
          currentStock: stockAfter,
          averageCost: averageCostAfter,
        },
      });
    }

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

  private async loadSimpleItemOrThrow(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    itemId: string,
  ): Promise<Item> {
    const item = await tx.item.findFirst({
      where: { id: itemId, businessId, type: 'PRODUCT', inventoryMode: 'SIMPLE' },
    });

    if (!item) {
      throw new NotFoundException('Simple inventory item not found');
    }

    return item;
  }

  private async getItemStockState(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    itemId: string,
  ) {
    const item = await this.loadSimpleItemOrThrow(tx, businessId, itemId);
    const latestMovement = await tx.inventoryMovement.findFirst({
      where: { businessId, itemId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        stockAfter: true,
        averageCostAfter: true,
      },
    });

    return {
      item,
      currentStock: latestMovement
        ? this.decimal(latestMovement.stockAfter)
        : this.decimal(0),
      averageCost: latestMovement
        ? this.decimal(latestMovement.averageCostAfter)
        : this.decimal(0),
    };
  }

  private async resolveMovementTarget(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: Pick<ApplyInventoryMovementInput, 'ingredientId' | 'itemId'>,
  ): Promise<StockTarget> {
    const hasIngredient = Boolean(input.ingredientId);
    const hasItem = Boolean(input.itemId);

    if (hasIngredient === hasItem) {
      throw new BadRequestException(
        'Inventory movement must target exactly one itemId or ingredientId',
      );
    }

    if (input.ingredientId) {
      return {
        kind: 'ingredient',
        ingredient: await this.loadIngredientOrThrow(
          tx,
          businessId,
          input.ingredientId,
        ),
      };
    }

    const state = await this.getItemStockState(tx, businessId, input.itemId!);
    return {
      kind: 'item',
      item: state.item,
      currentStock: state.currentStock,
      averageCost: state.averageCost,
    };
  }

  private async assertCanCreateInitialInventory(
    tx: Prisma.TransactionClient,
    businessId: string,
    target: { ingredientId?: string | null; itemId?: string | null },
  ) {
    await this.resolveMovementTarget(tx, businessId, target);

    const existingMovement = await tx.inventoryMovement.findFirst({
      where: {
        businessId,
        ...(target.ingredientId
          ? { ingredientId: target.ingredientId }
          : { itemId: target.itemId! }),
      },
      select: { id: true },
    });

    if (existingMovement) {
      throw new ConflictException(
        'Initial inventory can only be created before the first movement',
      );
    }
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

  private resolveMovementUnitCost(
    input: ApplyInventoryMovementInput,
    previousAverageCost: Prisma.Decimal,
  ) {
    const requiresUnitCost = [
      'INVENTORY_INITIAL',
      'PURCHASE',
      'PURCHASE_RETURN',
      'ADJUSTMENT_POSITIVE',
    ].includes(input.type);

    if (requiresUnitCost) {
      if (input.unitCost === undefined || input.unitCost === null) {
        throw new BadRequestException('unitCost is required for this movement');
      }
      return this.decimal(input.unitCost);
    }

    // SALE / SALE_RETURN / ADJUSTMENT_NEGATIVE use the current weighted average cost.
    return previousAverageCost;
  }

  private isStockIncrease(type: InventoryMovementType) {
    return ['INVENTORY_INITIAL', 'PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_POSITIVE'].includes(
      type,
    );
  }

  private recalculatesAverageCost(type: InventoryMovementType) {
    return [
      'INVENTORY_INITIAL',
      'PURCHASE',
      'PURCHASE_RETURN',
      'ADJUSTMENT_POSITIVE',
    ].includes(type);
  }

  private calculateAverageCostAfter(input: {
    type: InventoryMovementType;
    previousStock: Prisma.Decimal;
    previousAverageCost: Prisma.Decimal;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    stockAfter: Prisma.Decimal;
  }) {
    if (input.stockAfter.eq(0)) {
      return this.decimal(0);
    }

    if (input.type === 'PURCHASE_RETURN') {
      // Purchase return is a stock decrease but it must recalculate the weighted average using:
      // newAvg = (previousStock * previousAvg - qty * returnUnitCost) / newStock
      return input.previousStock
        .mul(input.previousAverageCost)
        .sub(input.quantity.mul(input.unitCost))
        .div(input.stockAfter)
        .toDecimalPlaces(6);
    }

    // Standard weighted average recomputation for stock increases that carry cost.
    const inputTotalValue = input.quantity.mul(input.unitCost).toDecimalPlaces(6);
    return this.calculateWeightedAverageCost(
      input.previousStock,
      input.previousAverageCost,
      input.quantity,
      inputTotalValue,
    );
  }

  private requiresDetail(type: InventoryMovementType) {
    return ['ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE'].includes(type);
  }

  private decimal(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  private parseExcludedOptionalIngredientIds(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  }

  private accountingDetail(type: InventoryMovementType, ingredientName: string) {
    const labels: Partial<Record<InventoryMovementType, string>> = {
      PURCHASE: 'Compra de inventario',
      PURCHASE_RETURN: 'Devolución de compra de inventario',
      ADJUSTMENT_POSITIVE: 'Ajuste positivo de inventario',
      ADJUSTMENT_NEGATIVE: 'Ajuste negativo de inventario',
    };

    return `${labels[type] ?? 'Movimiento de inventario'}: ${ingredientName}`;
  }

  private accountingNatureForInventoryMovement(type: InventoryMovementType) {
    if (type === 'PURCHASE' || type === 'ADJUSTMENT_POSITIVE') {
      return MovementNature.DEBIT;
    }

    if (type === 'PURCHASE_RETURN' || type === 'ADJUSTMENT_NEGATIVE') {
      return MovementNature.CREDIT;
    }

    return null;
  }

  private async resolveInventoryAccountingPucCuenta(
    tx: Prisma.TransactionClient,
  ) {
    for (const code of ['1435', '1105']) {
      const cuenta = await tx.pucCuenta.findUnique({ where: { code } });
      if (cuenta) return cuenta.code;
    }

    throw new BadRequestException(
      'No PUC account available to post inventory accounting movement',
    );
  }

  private async postManualInventoryAccounting(
    tx: Prisma.TransactionClient,
    businessId: string,
    movement: Prisma.InventoryMovementGetPayload<{
      include: { ingredient: true; item: true };
    }>,
  ) {
    if (!this.accountingService) {
      return null;
    }

    const nature = this.accountingNatureForInventoryMovement(movement.type);
    if (!nature) {
      // Initial inventory is intentionally not posted automatically: the
      // patrimonial origin is not explicit in the current accounting model.
      return null;
    }

    const existing = await tx.accountingMovement.findFirst({
      where: {
        businessId,
        originType: AccountingMovementOriginType.MANUAL,
        originId: movement.id,
      },
      select: { id: true },
    });

    if (existing) {
      return null;
    }

    const pucCuentaCode = await this.resolveInventoryAccountingPucCuenta(tx);

    return tx.accountingMovement.create({
      data: {
        businessId,
        pucCuentaCode,
        pucSubcuentaId: null,
        amount: this.decimal(movement.totalValue),
        nature,
        date: movement.occurredAt,
        detail: this.accountingDetail(
          movement.type,
          movement.ingredient?.name ?? movement.item?.name ?? 'Inventario',
        ),
        originType: AccountingMovementOriginType.MANUAL,
        originId: movement.id,
      },
    });
  }

  private async resolvePurchaseInput(
    tx: Prisma.TransactionClient,
    businessId: string,
    dto: CreateInventoryPurchaseDto,
  ): Promise<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal }> {
    const legacyTouched = dto.quantity !== undefined || dto.unitCost !== undefined;
    const purchaseTouched =
      dto.purchaseQuantity !== undefined || dto.purchaseUnitCost !== undefined;

    if (legacyTouched && purchaseTouched) {
      throw new BadRequestException(
        'Provide either quantity/unitCost or purchaseQuantity/purchaseUnitCost, not both',
      );
    }

    if (dto.itemId && purchaseTouched) {
      throw new BadRequestException(
        'purchaseQuantity/purchaseUnitCost are only supported for ingredients',
      );
    }

    if (legacyTouched) {
      if (dto.quantity === undefined || dto.unitCost === undefined) {
        throw new BadRequestException('quantity and unitCost are required together');
      }

      let quantity;
      let unitCost;

      try {
        quantity = this.decimal(dto.quantity);
        unitCost = this.decimal(dto.unitCost);
      } catch (e) {
        throw new BadRequestException('Cantidad o costo unitario inválidos');
      }

      if (quantity.lte(0) || Number.isNaN(quantity.toNumber())) {
        throw new BadRequestException('La cantidad debe ser mayor a cero');
      }

      if (unitCost.lte(0) || Number.isNaN(unitCost.toNumber())) {
        throw new BadRequestException('El costo unitario debe ser mayor a cero');
      }

      return {
        quantity: quantity.toDecimalPlaces(6),
        unitCost: unitCost.toDecimalPlaces(6),
      };
    }

    if (purchaseTouched) {
      if (dto.purchaseQuantity === undefined || dto.purchaseUnitCost === undefined) {
        throw new BadRequestException(
          'purchaseQuantity and purchaseUnitCost are required together',
        );
      }

      if (!dto.ingredientId) {
        throw new BadRequestException(
          'purchaseQuantity/purchaseUnitCost require ingredientId',
        );
      }

      const ingredient = await this.loadIngredientOrThrow(
        tx,
        businessId,
        dto.ingredientId,
      );

      const factor = this.getPurchaseToStockFactor(ingredient);
      if (factor.lte(0)) {
        throw new BadRequestException(
          'El factor de conversión del ingrediente debe ser mayor a cero',
        );
      }

      let purchaseQuantity;
      let purchaseUnitCost;

      try {
        purchaseQuantity = this.decimal(dto.purchaseQuantity);
        purchaseUnitCost = this.decimal(dto.purchaseUnitCost);
      } catch (e) {
        throw new BadRequestException('Cantidad o costo de compra inválidos');
      }

      if (purchaseQuantity.lte(0) || Number.isNaN(purchaseQuantity.toNumber())) {
        throw new BadRequestException('La cantidad de compra debe ser mayor a cero');
      }

      if (purchaseUnitCost.lte(0) || Number.isNaN(purchaseUnitCost.toNumber())) {
        throw new BadRequestException('El costo de compra debe ser mayor a cero');
      }

      const consumptionQuantity = purchaseQuantity.mul(factor).toDecimalPlaces(6);
      const unitCostPerConsumption = purchaseUnitCost.div(factor).toDecimalPlaces(6);

      return {
        quantity: consumptionQuantity,
        unitCost: unitCostPerConsumption,
      };
    }

    throw new BadRequestException(
      'Provide quantity/unitCost or purchaseQuantity/purchaseUnitCost',
    );
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
