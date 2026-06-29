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
  InventoryPurchaseMode,
  InventoryReferenceType,
  Item,
  ItemOptionQuantityMode,
  ItemOptionTargetType,
  MovementNature,
  Prisma,
  UnitKind,
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
  options?: Array<{
    targetTypeSnapshot: ItemOptionTargetType | string;
    ingredientId?: string | null;
    itemId?: string | null;
    quantityModeSnapshot: ItemOptionQuantityMode | string;
    totalQuantitySnapshot?: Prisma.Decimal | number | string | null;
    unitIdSnapshot?: string | null;
    optionNameSnapshot?: string | null;
    groupTitleSnapshot?: string | null;
  }>;
  item?: {
    inventoryMode?: string | null;
  } | null;
};

type OrderForInventory = {
  id: string;
  origin?: string | null;
  status?: string | null;
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
  purchaseMode?: InventoryPurchaseMode | null;
  purchasePresentationId?: string | null;
  purchaseQuantity?: number | string | Prisma.Decimal | null;
  purchaseUnitLabel?: string | null;
  factorToBaseUnitSnapshot?: number | string | Prisma.Decimal | null;
  conversionDetail?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  reservationId?: string | null;
  detail?: string | null;
  occurredAt?: Date;
};

type StockTarget =
  | { kind: 'ingredient'; ingredient: Ingredient }
  | {
      kind: 'item';
      item: Item;
      currentStock: Prisma.Decimal;
      averageCost: Prisma.Decimal;
    };

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

export type ItemSellabilityRequest = {
  itemId: string;
  quantity?: number | string | Prisma.Decimal;
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
      const purchase = await this.resolvePurchaseInput(tx, businessId, dto);

      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: dto.ingredientId,
        itemId: dto.itemId,
        type: 'PURCHASE',
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        referenceType: 'PURCHASE_MANUAL',
        referenceId: dto.referenceId ?? null,
        purchaseMode: purchase.purchaseMode,
        purchasePresentationId: purchase.purchasePresentationId,
        purchaseQuantity: purchase.purchaseQuantity,
        purchaseUnitLabel: purchase.purchaseUnitLabel,
        factorToBaseUnitSnapshot: purchase.factorToBaseUnitSnapshot,
        conversionDetail: purchase.conversionDetail,
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
                ...(query.from
                  ? { gte: this.parseDate(query.from, 'from') }
                  : {}),
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
                ...(query.from
                  ? { gte: this.parseDate(query.from, 'from') }
                  : {}),
                ...(query.to ? { lte: this.parseDate(query.to, 'to') } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listGlobalKardex(
    businessId: string,
    query: InventoryKardexGlobalQueryDto,
  ) {
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
              ...(query.dateTo
                ? { lte: this.parseDate(query.dateTo, 'to') }
                : {}),
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
      include: {
        _count: { select: { inventoryMovements: true } },
        stockUnit: true,
        defaultPurchaseUnit: true,
      },
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

  async listUnits() {
    return this.prisma.unit.findMany({
      where: { isActive: true },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
  }

  async listUnitConversions() {
    return this.prisma.unitConversion.findMany({
      include: {
        fromUnit: true,
        toUnit: true,
      },
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
      return {
        sellable: false,
        status: 'INACTIVE',
        message: `${item.name} no está activo.`,
      };
    }

    if (item.type === 'SERVICE') {
      const serviceIngredients = await tx.serviceIngredient.findMany({
        where: { businessId, serviceItemId: itemId, isActive: true },
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
      });

      if (serviceIngredients.length === 0) {
        return { sellable: true, status: 'SELLABLE' };
      }

      const requiredQuantity = this.decimal(quantity);
      for (const si of serviceIngredients) {
        const stock = this.decimal(si.ingredient.currentStock);
        const reqQty = this.decimal(si.quantityRequired).mul(requiredQuantity);
        if (stock.lt(reqQty)) {
          const unitStr = si.ingredient.customUnitLabel || si.ingredient.consumptionUnit;
          return {
            sellable: false,
            status: 'NO_STOCK',
            message: `Insumo ${si.ingredient.name} insuficiente para el servicio ${item.name}. Disponible: ${stock.toString()} ${unitStr}, Requerido: ${reqQty.toString()} ${unitStr}.`,
          };
        }
      }

      return { sellable: true, status: 'SELLABLE' };
    }

    if (item.inventoryMode === 'NONE') {
      return { sellable: true, status: 'SELLABLE' };
    }

    const requiredQuantity = this.decimal(quantity);

    if (item.inventoryMode === 'SIMPLE') {
      const currentStock = this.decimal(item.currentStock);
      const averageCost = this.decimal(item.averageCost);

      if (currentStock.lte(0)) {
        return {
          sellable: false,
          status: 'NO_STOCK',
          message: `${item.name} no tiene stock disponible.`,
          currentStock,
          averageCost,
        };
      }

      if (currentStock.lt(requiredQuantity)) {
        return {
          sellable: false,
          status: 'NO_STOCK',
          message: `Stock insuficiente para ${item.name}. Disponible: ${currentStock.toString()}, requerido: ${requiredQuantity.toString()}.`,
          currentStock,
          averageCost,
        };
      }

      const minStockValue = this.decimal(item.minStock ?? 0);
      const isLowStock =
        minStockValue.gt(0) && currentStock.lte(minStockValue);

      return {
        sellable: true,
        status: isLowStock ? 'LOW_STOCK' : 'SELLABLE',
        message: isLowStock ? `${item.name} tiene stock bajo.` : undefined,
        currentStock,
        averageCost,
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

      const maxUnits = reqPerUnit.gt(0)
        ? available.div(reqPerUnit)
        : this.decimal(Infinity);
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
          unit:
            line.ingredient.customUnitLabel ?? line.ingredient.consumptionUnit,
        });
      }
    }

    if (missingItems.length) {
      const availableUnits = virtualStock
        ? Math.floor(virtualStock.toNumber())
        : 0;
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

  async getItemsSellabilityBulk(
    businessId: string,
    requests: Array<string | ItemSellabilityRequest>,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ItemSellability[]> {
    if (requests.length === 0) return [];

    const normalizedRequests = requests.map((request) =>
      typeof request === 'string'
        ? { itemId: request, quantity: 1 }
        : { itemId: request.itemId, quantity: request.quantity ?? 1 },
    );
    const itemIds = Array.from(
      new Set(normalizedRequests.map((request) => request.itemId)),
    );
    const items = await tx.item.findMany({
      where: { businessId, id: { in: itemIds } },
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

    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more items were not found');
    }

    const itemById = new Map(items.map((item) => [item.id, item]));

    return normalizedRequests.map((request) => {
      const item = itemById.get(request.itemId)!;
      const requiredQuantity = this.decimal(request.quantity);

      if (item.status !== 'ACTIVE') {
        return {
          sellable: false,
          status: 'INACTIVE',
          message: `${item.name} no está activo.`,
        };
      }

      if (item.type === 'SERVICE' || item.inventoryMode === 'NONE') {
        return { sellable: true, status: 'SELLABLE' };
      }

      if (item.inventoryMode === 'SIMPLE') {
        const currentStock = this.decimal(item.currentStock);
        const averageCost = this.decimal(item.averageCost);
        if (currentStock.lte(0)) {
          return {
            sellable: false,
            status: 'NO_STOCK',
            message: `${item.name} no tiene stock disponible.`,
            currentStock,
            averageCost,
          };
        }
        if (currentStock.lt(requiredQuantity)) {
          return {
            sellable: false,
            status: 'NO_STOCK',
            message: `Stock insuficiente para ${item.name}. Disponible: ${currentStock.toString()}, requerido: ${requiredQuantity.toString()}.`,
            currentStock,
            averageCost,
          };
        }

        const minStockValue = this.decimal(item.minStock ?? 0);
        const isLowStock =
          minStockValue.gt(0) && currentStock.lte(minStockValue);
        return {
          sellable: true,
          status: isLowStock ? 'LOW_STOCK' : 'SELLABLE',
          message: isLowStock ? `${item.name} tiene stock bajo.` : undefined,
          currentStock,
          averageCost,
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
      const missingItems: NonNullable<ItemSellability['missingItems']> = [];
      for (const line of mandatoryLines) {
        const available = this.decimal(line.ingredient.currentStock);
        const requiredPerUnit = this.decimal(line.quantityRequired);
        if (requiredPerUnit.gt(0)) {
          const maxUnits = available.div(requiredPerUnit);
          if (virtualStock === null || maxUnits.lt(virtualStock)) {
            virtualStock = maxUnits;
          }
        }

        const required = requiredPerUnit.mul(requiredQuantity);
        if (available.lt(required)) {
          missingItems.push({
            id: line.ingredientId,
            name: line.ingredient.name,
            required,
            available,
            unit:
              line.ingredient.customUnitLabel ??
              line.ingredient.consumptionUnit,
          });
        }
      }

      if (missingItems.length) {
        const availableUnits = virtualStock
          ? Math.floor(virtualStock.toNumber())
          : 0;
        return {
          sellable: false,
          status: 'INSUFFICIENT_RECIPE_STOCK',
          message:
            availableUnits <= 0
              ? `${item.name} no tiene stock disponible.`
              : `Stock insuficiente para ${item.name}. Disponible: ${availableUnits}, requerido: ${requiredQuantity.toString()}.`,
          missingItems,
        };
      }

      return { sellable: true, status: 'SELLABLE' };
    });
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

    const mandatoryRecipeLines = item.recipes.filter(
      (recipe) => !recipe.isOptional,
    );
    if (
      item.inventoryMode === 'RECIPE_BASED' &&
      mandatoryRecipeLines.length < 1
    ) {
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
    const ingredientIds = ingredientRequirements.map(
      (item) => item.ingredientId!,
    );
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
    const sourceType = diagnosticContext.sourceType ?? 'ORDER';

    if (sourceType === 'ORDER') {
      if (!order || !order.id) {
        throw new BadRequestException('orderId is required for ORDER inventory flow');
      }
      if (order.inventoryPostedAt) {
        return [];
      }
    }

    const consumptions = await this.expandOrderItemsToIngredients(
      tx,
      businessId,
      order.items,
      {
        orderId: order?.id,
        sourceType,
        orderOrigin: order?.origin,
      },
    );
    const consolidatedConsumptions =
      this.consolidateOrderConsumptions(consumptions);
    await this.validateStockAvailability(
      businessId,
      consolidatedConsumptions,
      tx,
    );

    if (sourceType === 'ORDER_EDIT') {
      return { ok: true, requirements: consolidatedConsumptions } as any;
    }

    const movements = [];
    for (const consumption of consolidatedConsumptions) {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: consumption.ingredientId,
        itemId: consumption.itemId,
        type: 'SALE',
        quantity: consumption.quantity,
        referenceType: 'ORDER_ITEM',
        orderId: order.id,
        orderItemId: consumption.orderItemId,
        detail: `Sale item ${consumption.itemName}`,
        occurredAt,
      });
      movements.push(movement);
    }

    await tx.order.update({
      where: { id: order.id },
      data: { inventoryPostedAt: occurredAt },
    });

    return movements;
  }

  private consolidateOrderConsumptions(
    consumptions: OrderIngredientConsumption[],
  ) {
    const byTarget = new Map<string, OrderIngredientConsumption>();

    for (const consumption of consumptions) {
      const target = consumption.ingredientId
        ? `ingredient:${consumption.ingredientId}`
        : `item:${consumption.itemId}`;
      const key = `${consumption.orderItemId}:${target}`;
      const current = byTarget.get(key);
      byTarget.set(key, {
        ...consumption,
        quantity: (current?.quantity ?? this.decimal(0)).add(
          this.decimal(consumption.quantity),
        ),
      });
    }

    return Array.from(byTarget.values());
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
      {
        name: string;
        currentStock: Prisma.Decimal;
        averageCost: Prisma.Decimal;
      }
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
    diagnosticContext: {
      orderId?: string;
      sourceType?: string;
      orderOrigin?: string | null;
    } = {},
  ): Promise<OrderIngredientConsumption[]> {
    const consumptions: OrderIngredientConsumption[] = [];

    for (const orderItem of orderItems) {
      if (orderItem.itemTypeSnapshot === 'SERVICE') {
        const serviceIngredients = await tx.serviceIngredient.findMany({
          where: { businessId, serviceItemId: orderItem.itemId, isActive: true },
        });
        for (const si of serviceIngredients) {
          consumptions.push({
            orderItemId: orderItem.id,
            soldItemId: orderItem.itemId,
            itemName: orderItem.itemNameSnapshot,
            ingredientId: si.ingredientId,
            quantity: this.decimal(si.quantityRequired).mul(orderItem.quantity),
          });
        }
        continue;
      }

      const inventoryMode =
        orderItem.inventoryModeSnapshot ??
        orderItem.item?.inventoryMode ??
        'NONE';

      const baseLog = {
        orderId: diagnosticContext.orderId,
        sourceType: diagnosticContext.sourceType ?? 'ORDER',
        itemId: orderItem.itemId,
        itemName: orderItem.itemNameSnapshot,
        inventoryMode,
        quantitySold: orderItem.quantity,
      };

      // TODO(inventory-audit): remove temporary sale inventory diagnostic logs after production verification.
      const logMessage =
        (diagnosticContext.sourceType ?? 'ORDER') === 'ORDER_EDIT'
          ? '[InventoryService] Sale inventory simulation'
          : '[InventoryService] Sale inventory item';
      console.log(logMessage, baseLog);

      if (inventoryMode === 'NONE') {
        console.log('[InventoryService] Sale inventory skip', {
          ...baseLog,
          reason: 'inventoryMode NONE',
        });
        await this.appendOptionConsumptions(
          tx,
          businessId,
          orderItem,
          consumptions,
          diagnosticContext.orderOrigin,
        );
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
          throw new BadRequestException(
            sellability.message ?? 'Producto no vendible',
          );
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
        await this.appendOptionConsumptions(
          tx,
          businessId,
          orderItem,
          consumptions,
          diagnosticContext.orderOrigin,
        );
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
      const consumableLines = recipe.filter(
        (line) =>
          !line.isOptional ||
          !excludedOptionalIngredientIds.has(line.ingredientId),
      );

      console.log('[InventoryService] Sale inventory calculated consumption', {
        ...baseLog,
        excludedOptionalIngredientIds: Array.from(
          excludedOptionalIngredientIds,
        ),
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

      await this.appendOptionConsumptions(
        tx,
        businessId,
        orderItem,
        consumptions,
        diagnosticContext.orderOrigin,
      );
    }

    return consumptions;
  }

  private async appendOptionConsumptions(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    orderItem: OrderItemForInventory,
    consumptions: OrderIngredientConsumption[],
    orderOrigin?: string | null,
  ) {
    for (const option of orderItem.options ?? []) {
      const targetType = option.targetTypeSnapshot;
      if (targetType === ItemOptionTargetType.NONE || targetType === 'NONE') {
        continue;
      }

      const totalQuantity = option.totalQuantitySnapshot;
      if (totalQuantity == null) {
        throw new BadRequestException(
          `Option ${option.optionNameSnapshot ?? ''} is missing quantity snapshot`,
        );
      }
      const quantity = this.decimal(totalQuantity);
      if (quantity.lte(0)) {
        continue;
      }

      if (
        targetType === ItemOptionTargetType.INGREDIENT ||
        targetType === 'INGREDIENT'
      ) {
        if (!option.ingredientId) {
          throw new BadRequestException(
            'Option ingredient snapshot is missing',
          );
        }
        const convertedQuantity =
          await this.convertOptionQuantityToIngredientStock(
            tx,
            businessId,
            option.ingredientId,
            quantity,
            option.unitIdSnapshot ?? null,
            {
              itemName: orderItem.itemNameSnapshot,
              groupTitle: option.groupTitleSnapshot || '',
              optionName: option.optionNameSnapshot || '',
              orderOrigin,
            },
          );
        consumptions.push({
          orderItemId: orderItem.id,
          soldItemId: orderItem.itemId,
          itemName: orderItem.itemNameSnapshot,
          ingredientId: option.ingredientId,
          quantity: convertedQuantity,
        });
        continue;
      }

      if (targetType === ItemOptionTargetType.ITEM || targetType === 'ITEM') {
        if (!option.itemId) {
          throw new BadRequestException('Option item snapshot is missing');
        }
        const expanded = await this.expandItemRecipe(
          businessId,
          option.itemId,
          quantity,
          tx,
        );
        for (const requirement of expanded) {
          consumptions.push({
            orderItemId: orderItem.id,
            soldItemId: orderItem.itemId,
            itemName: option.optionNameSnapshot ?? orderItem.itemNameSnapshot,
            ingredientId: requirement.ingredientId,
            itemId: requirement.itemId,
            quantity: requirement.quantity,
          });
        }
      }
    }
  }

  private async convertOptionQuantityToIngredientStock(
    tx: Prisma.TransactionClient | PrismaService,
    businessId: string,
    ingredientId: string,
    quantity: Prisma.Decimal,
    unitId: string | null,
    optionContext?: {
      itemName: string;
      groupTitle: string;
      optionName: string;
      orderOrigin?: string | null;
    },
  ) {
    if (!unitId) return quantity;

    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredientId, businessId },
      select: { stockUnitId: true, name: true },
    });
    if (!ingredient) {
      throw new BadRequestException('Option ingredient snapshot is invalid');
    }
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'Option ingredient requires Unit catalog stock unit',
      );
    }
    if (ingredient.stockUnitId === unitId) return quantity;

    const direct = await tx.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: unitId,
          toUnitId: ingredient.stockUnitId,
        },
      },
    });
    if (direct) {
      return quantity.mul(direct.factor);
    }

    const reverse = await tx.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: ingredient.stockUnitId,
          toUnitId: unitId,
        },
      },
    });
    if (reverse) {
      return quantity.div(reverse.factor);
    }

    if (optionContext?.orderOrigin === 'PUBLIC_STORE') {
      let savedUnitSymbol = 'desconocida';
      let savedUnitName = '';
      if (unitId) {
        const savedUnit = await tx.unit.findUnique({ where: { id: unitId } });
        if (savedUnit) {
          savedUnitSymbol = savedUnit.symbol || savedUnit.name;
          savedUnitName = savedUnit.name;
        }
      }
      const expectedUnit = await tx.unit.findUnique({
        where: { id: ingredient.stockUnitId },
      });
      const expectedUnitSymbol =
        expectedUnit?.symbol || expectedUnit?.name || 'desconocida';
      const expectedUnitName = expectedUnit?.name || '';

      const expectedStr = expectedUnitName
        ? `${expectedUnitSymbol} (${expectedUnitName})`
        : expectedUnitSymbol;
      const savedStr = savedUnitName
        ? `${savedUnitSymbol} (${savedUnitName})`
        : savedUnitSymbol;

      throw new BadRequestException(
        `Esta orden fue creada con una configuración de opciones anterior o inválida. Eliminá el pedido y generalo nuevamente desde la tienda pública. Detalles: Producto "${optionContext.itemName}", Grupo "${optionContext.groupTitle}", Opción "${optionContext.optionName}", Ingrediente "${ingredient.name}", Unidad esperada: ${expectedStr}, Unidad guardada: ${savedStr}`,
      );
    }

    throw new BadRequestException('Option ingredient unit is incompatible');
  }

  async applyInventoryMovement(
    tx: Prisma.TransactionClient,
    businessId: string,
    input: ApplyInventoryMovementInput,
  ) {
    const target = await this.resolveMovementTarget(tx, businessId, input);
    const quantity = this.parsePositiveDecimal(
      input.quantity,
      'quantity must be greater than zero',
    );

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

      throw new BadRequestException(
        `Insufficient stock for ingredient ${targetName}`,
      );
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
    if (!averageCostAfter.isFinite() || averageCostAfter.lt(0)) {
      throw new BadRequestException(
        'Movement would produce an invalid average cost',
      );
    }

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
        purchaseMode: input.purchaseMode ?? null,
        purchasePresentationId: input.purchasePresentationId ?? null,
        purchaseQuantity: input.purchaseQuantity ?? null,
        purchaseUnitLabel: input.purchaseUnitLabel ?? null,
        factorToBaseUnitSnapshot: input.factorToBaseUnitSnapshot ?? null,
        conversionDetail: input.conversionDetail ?? null,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        reservationId: input.reservationId ?? null,
        detail: input.detail?.trim() || null,
        occurredAt: input.occurredAt ?? new Date(),
      } as any,
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
    } else {
      await tx.item.update({
        where: { id: target.item.id },
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
      where: {
        id: itemId,
        businessId,
        type: 'PRODUCT',
        inventoryMode: 'SIMPLE',
      },
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

    return {
      item,
      currentStock: this.decimal(item.currentStock),
      averageCost: this.decimal(item.averageCost),
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
      const ingredient = await this.loadIngredientOrThrow(
        tx,
        businessId,
        input.ingredientId,
      );
      if (ingredient.status === 'INACTIVE') {
        throw new BadRequestException(
          'Cannot create inventory movements for an inactive ingredient',
        );
      }
      return {
        kind: 'ingredient',
        ingredient,
      };
    }

    const state = await this.getItemStockState(tx, businessId, input.itemId!);
    if (state.item.status === 'INACTIVE') {
      throw new BadRequestException(
        'Cannot create inventory movements for an inactive item',
      );
    }
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
      return this.parseNonNegativeDecimal(
        input.unitCost,
        'unitCost must be a valid non-negative number',
      );
    }

    // SALE / SALE_RETURN / ADJUSTMENT_NEGATIVE use the current weighted average cost.
    return previousAverageCost;
  }

  private isStockIncrease(type: InventoryMovementType) {
    return [
      'INVENTORY_INITIAL',
      'PURCHASE',
      'SALE_RETURN',
      'ADJUSTMENT_POSITIVE',
    ].includes(type);
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
    const inputTotalValue = input.quantity
      .mul(input.unitCost)
      .toDecimalPlaces(6);
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

  private parsePositiveDecimal(value: unknown, message: string) {
    const decimal = this.parseFiniteDecimal(value, message);
    if (decimal.lte(0)) {
      throw new BadRequestException(message);
    }
    return decimal;
  }

  private parseNonNegativeDecimal(value: unknown, message: string) {
    const decimal = this.parseFiniteDecimal(value, message);
    if (decimal.lt(0)) {
      throw new BadRequestException(message);
    }
    return decimal;
  }

  private parseFiniteDecimal(value: unknown, message: string) {
    if (value === null || value === undefined || value === '') {
      throw new BadRequestException(message);
    }

    try {
      const decimal = new Prisma.Decimal(value as any);
      if (!decimal.isFinite()) {
        throw new BadRequestException(message);
      }
      return decimal;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(message);
    }
  }

  private parseExcludedOptionalIngredientIds(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === 'string');
  }

  private accountingDetail(
    type: InventoryMovementType,
    ingredientName: string,
  ) {
    const labels: Partial<Record<InventoryMovementType, string>> = {
      PURCHASE: 'Compra de inventario',
      PURCHASE_RETURN: 'Devolución de compra de inventario',
      ADJUSTMENT_POSITIVE: 'Ajuste positivo de inventario',
      ADJUSTMENT_NEGATIVE: 'Ajuste negativo de inventario',
    };

    return `${labels[type] ?? 'Movimiento de inventario'}: ${ingredientName}`;
  }

  private async resolveAccountingPucCuenta(
    tx: Prisma.TransactionClient,
    codes: string[],
  ) {
    for (const code of codes) {
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

    if (movement.type !== 'PURCHASE' && movement.type !== 'PURCHASE_RETURN') {
      // Initial inventory is intentionally not posted automatically: the
      // patrimonial origin is not explicit in the current accounting model.
      // Manual adjustments also require an explicit counterparty account.
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

    const inventoryPucCuentaCode = await this.resolveAccountingPucCuenta(tx, [
      '1435',
    ]);
    const paymentPucCuentaCode = await this.resolveAccountingPucCuenta(tx, [
      '1110',
      '1105',
    ]);
    const ingredientName =
      movement.ingredient?.name ?? movement.item?.name ?? 'Inventario';
    const inventoryNature =
      movement.type === 'PURCHASE'
        ? MovementNature.DEBIT
        : MovementNature.CREDIT;
    const counterpartyNature =
      movement.type === 'PURCHASE'
        ? MovementNature.CREDIT
        : MovementNature.DEBIT;
    const counterpartyDetail =
      movement.type === 'PURCHASE'
        ? `Contrapartida compra inventario: ${ingredientName}`
        : `Contrapartida devolución de compra inventario: ${ingredientName}`;
    const amount = this.decimal(movement.totalValue);

    const inventoryMovement = await tx.accountingMovement.create({
      data: {
        businessId,
        pucCuentaCode: inventoryPucCuentaCode,
        pucSubcuentaId: null,
        amount,
        nature: inventoryNature,
        date: movement.occurredAt,
        detail: this.accountingDetail(movement.type, ingredientName),
        originType: AccountingMovementOriginType.MANUAL,
        originId: movement.id,
      },
    });

    await tx.accountingMovement.create({
      data: {
        businessId,
        pucCuentaCode: paymentPucCuentaCode,
        pucSubcuentaId: null,
        amount,
        nature: counterpartyNature,
        date: movement.occurredAt,
        detail: counterpartyDetail,
        originType: AccountingMovementOriginType.MANUAL,
        originId: movement.id,
      },
    });

    return inventoryMovement;
  }

  private async resolvePurchaseInput(
    tx: Prisma.TransactionClient,
    businessId: string,
    dto: CreateInventoryPurchaseDto,
  ): Promise<{
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    purchaseMode: InventoryPurchaseMode | null;
    purchasePresentationId?: string | null;
    purchaseQuantity?: Prisma.Decimal | null;
    purchaseUnitLabel?: string | null;
    factorToBaseUnitSnapshot?: Prisma.Decimal | null;
    conversionDetail?: string | null;
  }> {
    const legacyTouched =
      dto.quantity !== undefined || dto.unitCost !== undefined;
    const purchaseTouched =
      dto.purchaseQuantity !== undefined ||
      dto.purchaseUnitCost !== undefined ||
      dto.purchaseUnitId !== undefined ||
      dto.purchasePresentationId !== undefined;

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
      if (dto.ingredientId) {
        throw new BadRequestException(
          'Ingredient purchases must use the new unit model. Migrate the ingredient before purchasing.',
        );
      }

      if (dto.quantity === undefined || dto.unitCost === undefined) {
        throw new BadRequestException(
          'quantity and unitCost are required together',
        );
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
        throw new BadRequestException(
          'El costo unitario debe ser mayor a cero',
        );
      }

      return {
        quantity: quantity.toDecimalPlaces(6),
        unitCost: unitCost.toDecimalPlaces(6),
        purchaseMode: null,
      };
    }

    if (purchaseTouched) {
      if (
        dto.purchaseQuantity === undefined ||
        dto.purchaseUnitCost === undefined
      ) {
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

      if (ingredient.stockUnitId) {
        let purchaseQuantity;
        let purchaseUnitCost;

        try {
          purchaseQuantity = this.decimal(dto.purchaseQuantity);
          purchaseUnitCost = this.decimal(dto.purchaseUnitCost);
        } catch (e) {
          throw new BadRequestException('Cantidad o costo de compra invalidos');
        }

        if (
          purchaseQuantity.lte(0) ||
          Number.isNaN(purchaseQuantity.toNumber())
        ) {
          throw new BadRequestException(
            'La cantidad de compra debe ser mayor a cero',
          );
        }

        if (
          purchaseUnitCost.lte(0) ||
          Number.isNaN(purchaseUnitCost.toNumber())
        ) {
          throw new BadRequestException(
            'El costo de compra debe ser mayor a cero',
          );
        }

        if (dto.purchasePresentationId && dto.purchaseUnitId) {
          throw new BadRequestException(
            'Provide purchasePresentationId or purchaseUnitId, not both',
          );
        }

        if (dto.purchasePresentationId) {
          return this.resolvePresentationPurchaseInput(tx, businessId, ingredient, {
            purchasePresentationId: dto.purchasePresentationId,
            purchaseQuantity,
            purchaseUnitCost,
          });
        }

        return this.resolveStandardPurchaseInput(tx, ingredient, {
          purchaseUnitId:
            dto.purchaseUnitId ?? ingredient.defaultPurchaseUnitId,
          purchaseQuantity,
          purchaseUnitCost,
        });
      }

      if (dto.purchaseUnitId || dto.purchasePresentationId) {
        throw new BadRequestException(
          'Unit purchase fields require ingredient stockUnitId',
        );
      }

      throw new BadRequestException(
        'Ingredient must be migrated to the new unit model before purchasing',
      );
    }

    throw new BadRequestException(
      'Provide quantity/unitCost or purchaseQuantity/purchaseUnitCost',
    );
  }

  private async resolveUnitConversionFactor(
    tx: Prisma.TransactionClient,
    fromUnitId: string,
    toUnitId: string,
  ) {
    const conversion = await tx.unitConversion.findUnique({
      where: { fromUnitId_toUnitId: { fromUnitId, toUnitId } },
      include: { fromUnit: true, toUnit: true },
    });

    if (!conversion) {
      throw new BadRequestException(
        'La unidad de compra no es compatible con la unidad base del insumo.',
      );
    }

    // Commercial package labels are ingredient-specific presentations, not global conversions.
    if (
      conversion.fromUnit.kind === UnitKind.COMMERCIAL ||
      conversion.toUnit.kind === UnitKind.COMMERCIAL
    ) {
      throw new BadRequestException(
        'La unidad de compra no es compatible con la unidad base del insumo.',
      );
    }

    if (
      conversion.fromUnit.kind === UnitKind.COUNT &&
      conversion.fromUnit.code !== conversion.toUnit.code &&
      !(
        conversion.toUnit.code === 'UNIT' &&
        ['DOZEN', 'SIX_PACK'].includes(conversion.fromUnit.code)
      )
    ) {
      throw new BadRequestException(
        'La unidad de compra no es compatible con la unidad base del insumo.',
      );
    }

    return conversion;
  }

  private async resolveStandardPurchaseInput(
    tx: Prisma.TransactionClient,
    ingredient: Ingredient,
    input: {
      purchaseUnitId?: string | null;
      purchaseQuantity: Prisma.Decimal;
      purchaseUnitCost: Prisma.Decimal;
    },
  ) {
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'Ingredient stockUnitId is required for standard purchase',
      );
    }
    if (!input.purchaseUnitId) {
      throw new BadRequestException(
        'purchaseUnitId is required for standard purchase',
      );
    }

    const purchaseUnit = await tx.unit.findUnique({
      where: { id: input.purchaseUnitId },
    });
    if (!purchaseUnit)
      throw new BadRequestException('purchaseUnitId is invalid');
    // Commercial package labels are ingredient-specific presentations, not standard units.
    if (purchaseUnit.kind === UnitKind.COMMERCIAL) {
      throw new BadRequestException(
        'La unidad de compra no es compatible con la unidad base del insumo.',
      );
    }

    const conversion = await this.resolveUnitConversionFactor(
      tx,
      input.purchaseUnitId,
      ingredient.stockUnitId,
    );
    const factor = this.decimal(conversion.factor);
    const quantity = input.purchaseQuantity.mul(factor).toDecimalPlaces(6);
    const totalValue = input.purchaseQuantity
      .mul(input.purchaseUnitCost)
      .toDecimalPlaces(6);
    const unitCost = totalValue.div(quantity).toDecimalPlaces(6);

    return {
      quantity,
      unitCost,
      purchaseMode: InventoryPurchaseMode.STANDARD,
      purchaseQuantity: input.purchaseQuantity,
      purchaseUnitLabel: conversion.fromUnit.symbol,
      factorToBaseUnitSnapshot: factor,
      conversionDetail: `1 ${conversion.fromUnit.symbol} = ${factor.toString()} ${conversion.toUnit.symbol}`,
    };
  }

  private async resolvePresentationPurchaseInput(
    tx: Prisma.TransactionClient,
    businessId: string,
    ingredient: Ingredient,
    input: {
      purchasePresentationId: string;
      purchaseQuantity: Prisma.Decimal;
      purchaseUnitCost: Prisma.Decimal;
    },
  ) {
    if (!ingredient.stockUnitId) {
      throw new BadRequestException(
        'Ingredient stockUnitId is required for presentation purchase',
      );
    }

    const presentation = await tx.ingredientPurchasePresentation.findFirst({
      where: {
        id: input.purchasePresentationId,
        businessId,
        ingredientId: ingredient.id,
      } as any,
      include: { purchaseUnit: true, contentUnit: true },
    });

    if (!presentation) {
      throw new NotFoundException('Purchase presentation not found');
    }
    if (!presentation.isActive) {
      throw new BadRequestException('Purchase presentation is inactive');
    }

    const conversion = await this.resolveUnitConversionFactor(
      tx,
      presentation.contentUnitId,
      ingredient.stockUnitId,
    );
    const contentFactor = this.decimal(conversion.factor);
    const presentationFactor = this.decimal(presentation.innerQuantity)
      .mul(this.decimal(presentation.contentQuantity))
      .mul(contentFactor)
      .toDecimalPlaces(6);

    if (presentationFactor.lte(0)) {
      throw new BadRequestException(
        'Purchase presentation conversion is invalid',
      );
    }

    const quantity = input.purchaseQuantity
      .mul(presentationFactor)
      .toDecimalPlaces(6);
    const totalValue = input.purchaseQuantity
      .mul(input.purchaseUnitCost)
      .toDecimalPlaces(6);
    const unitCost = totalValue.div(quantity).toDecimalPlaces(6);
    const purchaseUnitLabel =
      presentation.purchaseUnit.symbol || presentation.purchaseUnit.name;
    const contentUnitLabel =
      presentation.contentUnit.symbol || presentation.contentUnit.name;
    const stockUnitLabel = conversion.toUnit.symbol || conversion.toUnit.name;
    const innerLabel = presentation.innerUnitLabel?.trim() || 'unidades';

    return {
      quantity,
      unitCost,
      purchaseMode: InventoryPurchaseMode.PRESENTATION,
      purchasePresentationId: presentation.id,
      purchaseQuantity: input.purchaseQuantity,
      purchaseUnitLabel,
      factorToBaseUnitSnapshot: presentationFactor,
      conversionDetail:
        this.decimal(presentation.innerQuantity).eq(1)
          ? `1 ${purchaseUnitLabel} × ${presentationFactor.toString()} ${stockUnitLabel} = ${presentationFactor.toString()} ${stockUnitLabel}`
          : `1 ${purchaseUnitLabel} ${presentation.name} = ` +
            `${this.decimal(presentation.innerQuantity).toString()} ${innerLabel} x ` +
            `${this.decimal(presentation.contentQuantity).toString()} ${contentUnitLabel} = ` +
            `${presentationFactor.toString()} ${stockUnitLabel}`,
    };
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

  async listServiceConsumption(businessId: string) {
    const services = await this.prisma.item.findMany({
      where: { businessId, type: 'SERVICE', status: 'ACTIVE' },
      include: {
        serviceIngredients: {
          where: { isActive: true },
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
      orderBy: { name: 'asc' },
    });

    return services.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price),
      durationMinutes: s.durationMinutes,
      status: s.status,
      ingredients: s.serviceIngredients.map((si) => ({
        id: si.id,
        ingredientId: si.ingredientId,
        name: si.ingredient.name,
        quantityRequired: Number(si.quantityRequired),
        currentStock: Number(si.ingredient.currentStock),
        consumptionUnit: si.ingredient.consumptionUnit,
        customUnitLabel: si.ingredient.customUnitLabel,
      })),
    }));
  }

  async getServiceConsumption(businessId: string, serviceItemId: string) {
    const service = await this.prisma.item.findFirst({
      where: { id: serviceItemId, businessId, type: 'SERVICE' },
      include: {
        serviceIngredients: {
          where: { isActive: true },
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

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return {
      id: service.id,
      name: service.name,
      price: Number(service.price),
      durationMinutes: service.durationMinutes,
      status: service.status,
      ingredients: service.serviceIngredients.map((si) => ({
        id: si.id,
        ingredientId: si.ingredientId,
        name: si.ingredient.name,
        quantityRequired: Number(si.quantityRequired),
        currentStock: Number(si.ingredient.currentStock),
        consumptionUnit: si.ingredient.consumptionUnit,
        customUnitLabel: si.ingredient.customUnitLabel,
      })),
    };
  }

  async replaceServiceConsumption(
    businessId: string,
    serviceItemId: string,
    dto: { ingredients: Array<{ ingredientId: string; quantityRequired: string }> },
  ) {
    const service = await this.prisma.item.findFirst({
      where: { id: serviceItemId, businessId, type: 'SERVICE' },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Validate ingredients belong to the same business and quantity > 0
    const ingredientIds = dto.ingredients.map((i) => i.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      throw new BadRequestException('Duplicate ingredients are not allowed');
    }

    const dbIngredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, businessId, status: 'ACTIVE' },
    });

    if (dbIngredients.length !== ingredientIds.length) {
      throw new BadRequestException('One or more ingredients are invalid or inactive');
    }

    for (const ing of dto.ingredients) {
      const qty = this.decimal(ing.quantityRequired);
      if (qty.lte(0)) {
        throw new BadRequestException('quantityRequired must be greater than zero');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Deactivate/delete previous service ingredients
      await tx.serviceIngredient.deleteMany({
        where: { businessId, serviceItemId },
      });

      // Create new service ingredients
      const created = [];
      for (const ing of dto.ingredients) {
        const qty = this.decimal(ing.quantityRequired);
        const item = await tx.serviceIngredient.create({
          data: {
            businessId,
            serviceItemId,
            ingredientId: ing.ingredientId,
            quantityRequired: qty,
          },
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
        });
        created.push(item);
      }

      return created.map((si) => ({
        id: si.id,
        ingredientId: si.ingredientId,
        name: si.ingredient.name,
        quantityRequired: Number(si.quantityRequired),
        currentStock: Number(si.ingredient.currentStock),
        consumptionUnit: si.ingredient.consumptionUnit,
        customUnitLabel: si.ingredient.customUnitLabel,
      }));
    });
  }

  async applyInventoryConsumptionForReservation(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservation: { id: string; itemId: string; customerName: string | null; item: { name: string }; inventoryPostedAt?: Date | null },
    occurredAt: Date = new Date(),
  ) {
    if (reservation.inventoryPostedAt) {
      return [];
    }

    const serviceIngredients = await tx.serviceIngredient.findMany({
      where: { businessId, serviceItemId: reservation.itemId, isActive: true },
    });

    if (serviceIngredients.length === 0) {
      // Mark as posted anyway to prevent repeating this check
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { inventoryPostedAt: occurredAt },
      });
      return [];
    }

    const consumptions: OrderIngredientConsumption[] = serviceIngredients.map((si) => ({
      ingredientId: si.ingredientId,
      quantity: this.decimal(si.quantityRequired),
      orderItemId: `virtual-res-oi-${reservation.id}`, // Placeholder
      soldItemId: reservation.itemId,
      itemName: reservation.item.name,
    }));

    await this.validateStockAvailability(businessId, consumptions, tx);

    const movements = [];
    for (const consumption of consumptions) {
      const movement = await this.applyInventoryMovement(tx, businessId, {
        ingredientId: consumption.ingredientId,
        type: 'SALE',
        quantity: consumption.quantity,
        referenceType: 'RESERVATION',
        reservationId: reservation.id,
        detail: `Service consumption: ${reservation.item.name}`,
        occurredAt,
      });
      movements.push(movement);
    }

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { inventoryPostedAt: occurredAt },
    });

    return movements;
  }

  async reverseInventoryConsumptionForReservation(
    tx: Prisma.TransactionClient,
    businessId: string,
    reservationId: string,
  ) {
    const saleMovements = await tx.inventoryMovement.findMany({
      where: {
        businessId,
        reservationId,
        type: 'SALE',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!saleMovements.length) {
      return [];
    }

    const existingReturn = await tx.inventoryMovement.findMany({
      where: {
        businessId,
        reservationId,
        type: 'SALE_RETURN',
      },
      take: 1,
      select: { id: true },
    });

    if (existingReturn.length) {
      throw new ConflictException('Reservation inventory already reversed');
    }

    const ingredientIds = Array.from(
      new Set(
        saleMovements
          .map((m) => m.ingredientId)
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

    const ingredientState = new Map(
      ingredients.map((ing) => [
        ing.id,
        {
          name: ing.name,
          currentStock: this.decimal(ing.currentStock),
          averageCost: this.decimal(ing.averageCost),
        },
      ]),
    );

    const created = [];
    for (const movement of saleMovements) {
      const state = ingredientState.get(movement.ingredientId!);
      if (!state) {
        throw new NotFoundException(
          `Inventory target not found for return movement (${movement.id})`,
        );
      }

      const quantity = this.decimal(movement.quantity);
      const stockAfter = state.currentStock.add(quantity);

      const createdMovement = await tx.inventoryMovement.create({
        data: {
          businessId,
          ingredientId: movement.ingredientId,
          type: 'SALE_RETURN',
          quantity,
          unitCost: movement.unitCost,
          totalValue: movement.totalValue,
          stockAfter,
          averageCostAfter: state.averageCost,
          referenceType: 'RESERVATION',
          reservationId,
          detail: 'Sale return generated from reservation cancellation',
        },
      });

      await tx.ingredient.update({
        where: { id: movement.ingredientId! },
        data: {
          currentStock: stockAfter,
        },
      });

      state.currentStock = stockAfter;
      created.push(createdMovement);
    }

    return created;
  }

  async getRecipeConsumptionHistory(
    businessId: string,
    itemId: string,
    query: { from?: string; to?: string },
  ) {
    const where: Prisma.InventoryMovementWhereInput = {
      businessId,
      type: { in: ['SALE', 'SALE_RETURN'] },
      orderItem: { itemId },
    };

    const occurredAtFilter: any = {};
    if (query.from) {
      occurredAtFilter.gte = this.parseDate(query.from, 'from');
    }
    if (query.to) {
      occurredAtFilter.lte = this.parseDate(query.to, 'to');
    }
    if (query.from || query.to) {
      where.occurredAt = occurredAtFilter;
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            consumptionUnit: true,
            customUnitLabel: true,
          },
        },
        orderItem: {
          select: {
            id: true,
            quantity: true,
            order: {
              select: {
                id: true,
                documentNumber: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
    });

    return movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: Number(m.quantity),
      unitCost: Number(m.unitCost),
      totalValue: Number(m.totalValue),
      occurredAt: m.occurredAt,
      ingredient: m.ingredient
        ? {
            id: m.ingredient.id,
            name: m.ingredient.name,
            consumptionUnit: m.ingredient.consumptionUnit,
            customUnitLabel: m.ingredient.customUnitLabel,
          }
        : null,
      order: m.orderItem?.order
        ? {
            id: m.orderItem.order.id,
            documentNumber: m.orderItem.order.documentNumber,
            quantitySold: m.orderItem.quantity,
            createdAt: m.orderItem.order.createdAt,
          }
        : null,
    }));
  }

  async getServiceConsumptionHistory(
    businessId: string,
    serviceItemId: string,
    query: { from?: string; to?: string },
  ) {
    const where: Prisma.InventoryMovementWhereInput = {
      businessId,
      type: { in: ['SALE', 'SALE_RETURN'] },
      OR: [
        { orderItem: { itemId: serviceItemId } },
        { reservation: { itemId: serviceItemId } },
      ],
    };

    const occurredAtFilter: any = {};
    if (query.from) {
      occurredAtFilter.gte = this.parseDate(query.from, 'from');
    }
    if (query.to) {
      occurredAtFilter.lte = this.parseDate(query.to, 'to');
    }
    if (query.from || query.to) {
      where.occurredAt = occurredAtFilter;
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            consumptionUnit: true,
            customUnitLabel: true,
          },
        },
        orderItem: {
          select: {
            id: true,
            quantity: true,
            order: {
              select: {
                id: true,
                documentNumber: true,
                createdAt: true,
              },
            },
          },
        },
        reservation: {
          select: {
            id: true,
            customerName: true,
            date: true,
            startMinute: true,
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
    });

    return movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: Number(m.quantity),
      unitCost: Number(m.unitCost),
      totalValue: Number(m.totalValue),
      occurredAt: m.occurredAt,
      ingredient: m.ingredient
        ? {
            id: m.ingredient.id,
            name: m.ingredient.name,
            consumptionUnit: m.ingredient.consumptionUnit,
            customUnitLabel: m.ingredient.customUnitLabel,
          }
        : null,
      order: m.orderItem?.order
        ? {
            id: m.orderItem.order.id,
            documentNumber: m.orderItem.order.documentNumber,
            quantitySold: m.orderItem.quantity,
            createdAt: m.orderItem.order.createdAt,
          }
        : null,
      reservation: m.reservation
        ? {
            id: m.reservation.id,
            customerName: m.reservation.customerName,
            date: m.reservation.date,
            startMinute: m.reservation.startMinute,
          }
        : null,
    }));
  }
}
