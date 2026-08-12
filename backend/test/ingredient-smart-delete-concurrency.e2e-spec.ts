import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMode, ItemType, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { IngredientsService } from '../src/ingredients/ingredients.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SalesService } from '../src/sales/sales.service';

describe('Ingredient smart deletion concurrency (PostgreSQL)', () => {
  let app: INestApplication;
  let ingredients: IngredientsService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  let sales: SalesService;
  let businessId: string;
  let unitId: string;
  let suffix: string;

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
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const business = await prisma.business.create({
      data: {
        name: 'Ingredient smart delete concurrency test',
        slug: `ingredient-smart-delete-${suffix}`,
        fiscalId: `test-${suffix}`,
        phoneWhatsapp: '0000000000',
      },
    });
    businessId = business.id;
    unitId = (await prisma.unit.findUniqueOrThrow({ where: { code: 'UNIT' } }))
      .id;
  });

  afterAll(async () => {
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    if (app) await app.close();
  });

  const createIngredient = (name: string) =>
    ingredients.create(businessId, {
      name,
      stockUnitId: unitId,
      defaultPurchaseUnitId: unitId,
      minStock: '0',
    });

  it('allows only one of two concurrent normalized names', async () => {
    const name = `Leche concurrente ${suffix}`;
    const results = await Promise.allSettled([
      createIngredient(name),
      createIngredient(`  ${name.toUpperCase()}  `),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.ingredient.count({
        where: {
          businessId,
          deletedAt: null,
          name: { contains: name, mode: 'insensitive' },
        },
      }),
    ).resolves.toBe(1);
  });

  it('serializes delete and create without leaving two current identities', async () => {
    const name = `Leche delete-create ${suffix}`;
    const original = await createIngredient(name);
    await Promise.allSettled([
      ingredients.remove(businessId, original.id),
      createIngredient(name.toLowerCase()),
    ]);

    await expect(
      prisma.ingredient.count({
        where: {
          businessId,
          deletedAt: null,
          name: { equals: name, mode: 'insensitive' },
        },
      }),
    ).resolves.toBeLessThanOrEqual(1);
  });

  it('serializes soft delete and sale posting without partial movements', async () => {
    const ingredient = await createIngredient(`Ingrediente venta ${suffix}`);
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: { currentStock: 10, averageCost: 2 },
    });
    const item = await prisma.item.create({
      data: {
        businessId,
        name: `Producto venta ${suffix}`,
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

    const [posting] = await Promise.allSettled([
      (sales as any).runSerializableTransaction(
        (tx: Prisma.TransactionClient) =>
          inventory.applyInventoryConsumptionForOrder(
            tx,
            businessId,
            order as any,
          ),
      ),
      ingredients.remove(businessId, ingredient.id),
    ]);
    const movementCount = await prisma.inventoryMovement.count({
      where: { businessId, orderId: order.id },
    });
    expect(movementCount).toBe(posting.status === 'fulfilled' ? 1 : 0);
    const deleted = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });
    expect(deleted.status).toBe('INACTIVE');
    expect(deleted.deletedAt).not.toBeNull();
  });
});
