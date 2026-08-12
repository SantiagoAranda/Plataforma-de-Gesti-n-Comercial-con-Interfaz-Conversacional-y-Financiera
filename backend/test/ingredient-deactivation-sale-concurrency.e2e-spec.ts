import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IngredientUnit,
  InventoryMode,
  ItemType,
  Prisma,
  UnitKind,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AppModule } from '../src/app.module';
import { IngredientsService } from '../src/ingredients/ingredients.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';

describe('Ingredient deactivation versus sale inventory posting (PostgreSQL)', () => {
  let app: INestApplication;
  let ingredients: IngredientsService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  let sales: SalesService;
  let businessId: string;
  let unitId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    ingredients = app.get(IngredientsService);
    inventory = app.get(InventoryService);
    prisma = app.get(PrismaService);
    sales = app.get(SalesService);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const business = await prisma.business.create({
      data: {
        name: 'Ingredient sale concurrency test',
        slug: `ingredient-sale-concurrency-${suffix}`,
        fiscalId: `test-${suffix}`,
        phoneWhatsapp: '0000000000',
      },
    });
    businessId = business.id;
    const unit = await prisma.unit.create({
      data: {
        code: `TEST_UNIT_${suffix}`,
        name: 'Unidad test',
        symbol: 'u',
        kind: UnitKind.COUNT,
        isSystem: false,
      },
    });
    unitId = unit.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.inventoryMovement.deleteMany({ where: { businessId } });
      await prisma.order.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (unitId) await prisma.unit.delete({ where: { id: unitId } });
    if (app) await app.close();
  });

  async function createFixture(label: string) {
    const ingredient = await prisma.ingredient.create({
      data: {
        businessId,
        name: `Ingrediente ${label}`,
        consumptionUnit: IngredientUnit.UNIT,
        purchaseUnit: IngredientUnit.UNIT,
        purchaseToConsumptionFactor: 1,
        stockUnitId: unitId,
        defaultPurchaseUnitId: unitId,
        currentStock: 10,
        averageCost: 2,
      },
    });
    const item = await prisma.item.create({
      data: {
        businessId,
        name: `Producto ${label}`,
        type: ItemType.PRODUCT,
        price: 10,
        inventoryMode: InventoryMode.RECIPE_BASED,
      },
    });
    await prisma.recipe.create({
      data: {
        businessId,
        itemId: item.id,
        ingredientId: ingredient.id,
        quantityRequired: 1,
      },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        total: 10,
        items: {
          create: {
            businessId,
            itemId: item.id,
            quantity: 1,
            itemNameSnapshot: item.name,
            itemTypeSnapshot: ItemType.PRODUCT,
            inventoryModeSnapshot: InventoryMode.RECIPE_BASED,
            unitPrice: 10,
            lineTotal: 10,
          },
        },
      },
      include: { items: { include: { item: true, options: true } } },
    });
    return { ingredient, item, order };
  }

  it('rejects posting after deactivation and creates no movement', async () => {
    const fixture = await createFixture('deactivate-first');
    await ingredients.deactivate(businessId, fixture.ingredient.id);

    await expect(
      (sales as any).runSerializableTransaction(
        (tx: Prisma.TransactionClient) =>
          inventory.applyInventoryConsumptionForOrder(
            tx,
            businessId,
            fixture.order as any,
          ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'RECIPE_REQUIRES_REVIEW' },
    });

    await expect(
      prisma.inventoryMovement.count({
        where: { businessId, orderId: fixture.order.id },
      }),
    ).resolves.toBe(0);
  });

  it('serializes simultaneous posting and deactivation without a partial sale', async () => {
    const fixture = await createFixture('parallel');

    const [posting, deactivation] = await Promise.allSettled([
      (sales as any).runSerializableTransaction(
        (tx: Prisma.TransactionClient) =>
          inventory.applyInventoryConsumptionForOrder(
            tx,
            businessId,
            fixture.order as any,
          ),
      ),
      ingredients.deactivate(businessId, fixture.ingredient.id),
    ]);

    expect(deactivation.status).toBe('fulfilled');
    const movementCount = await prisma.inventoryMovement.count({
      where: { businessId, orderId: fixture.order.id },
    });
    if (posting.status === 'fulfilled') {
      expect(posting.value).toHaveLength(1);
      expect(movementCount).toBe(1);
    } else {
      expect(posting.reason).toMatchObject({
        response: { code: 'RECIPE_REQUIRES_REVIEW' },
      });
      expect(movementCount).toBe(0);
    }

    const finalIngredient = await prisma.ingredient.findUniqueOrThrow({
      where: { id: fixture.ingredient.id },
    });
    expect(finalIngredient.status).toBe('INACTIVE');
  });
});
