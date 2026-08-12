import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientUnit, UnitKind } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AppModule } from '../src/app.module';
import { IngredientsService } from '../src/ingredients/ingredients.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Purchase presentation default concurrency (PostgreSQL)', () => {
  let app: INestApplication;
  let ingredients: IngredientsService;
  let prisma: PrismaService;
  let businessId: string;
  let ingredientId: string;
  const unitIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    ingredients = app.get(IngredientsService);
    prisma = app.get(PrismaService);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const business = await prisma.business.create({
      data: {
        name: 'Presentation concurrency test',
        slug: `presentation-concurrency-${suffix}`,
        fiscalId: `test-${suffix}`,
        phoneWhatsapp: '0000000000',
      },
    });
    businessId = business.id;
    const [grams, box, bag] = await Promise.all([
      prisma.unit.create({
        data: {
          code: `TEST_G_${suffix}`,
          name: 'Gramo test',
          symbol: 'g',
          kind: UnitKind.WEIGHT,
          isSystem: false,
        },
      }),
      prisma.unit.create({
        data: {
          code: `TEST_BOX_${suffix}`,
          name: 'Caja test',
          symbol: 'caja',
          kind: UnitKind.COMMERCIAL,
          isSystem: false,
        },
      }),
      prisma.unit.create({
        data: {
          code: `TEST_BAG_${suffix}`,
          name: 'Bulto test',
          symbol: 'bulto',
          kind: UnitKind.COMMERCIAL,
          isSystem: false,
        },
      }),
    ]);
    unitIds.push(grams.id, box.id, bag.id);
    const ingredient = await prisma.ingredient.create({
      data: {
        businessId,
        name: 'Levadura concurrente',
        consumptionUnit: IngredientUnit.G,
        purchaseUnit: IngredientUnit.G,
        purchaseToConsumptionFactor: 1,
        stockUnitId: grams.id,
        defaultPurchaseUnitId: grams.id,
      },
    });
    ingredientId = ingredient.id;

    await ingredients.createPurchasePresentation(businessId, ingredientId, {
      name: 'Caja',
      purchaseUnitId: box.id,
      innerQuantity: '24',
      innerUnitLabel: 'paquete',
      contentQuantity: '500',
      contentUnitId: grams.id,
      isDefault: true,
      isActive: true,
    });
    await ingredients.createPurchasePresentation(businessId, ingredientId, {
      name: 'Bulto',
      purchaseUnitId: bag.id,
      innerQuantity: '10',
      innerUnitLabel: 'paquete',
      contentQuantity: '500',
      contentUnitId: grams.id,
      isDefault: false,
      isActive: true,
    });
  });

  afterAll(async () => {
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    if (unitIds.length)
      await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
    if (app) await app.close();
  });

  it('serializes simultaneous attempts to select different defaults', async () => {
    const current = await prisma.ingredientPurchasePresentation.findMany({
      where: { businessId, ingredientId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(current).toHaveLength(2);

    await Promise.all(
      current.map((presentation) =>
        ingredients.updatePurchasePresentation(
          businessId,
          ingredientId,
          presentation.id,
          {
            name: presentation.name,
            purchaseUnitId: presentation.purchaseUnitId,
            innerQuantity: presentation.innerQuantity.toString(),
            innerUnitLabel: presentation.innerUnitLabel!,
            contentQuantity: presentation.contentQuantity.toString(),
            contentUnitId: presentation.contentUnitId,
            isDefault: true,
            isActive: true,
          },
        ),
      ),
    );

    const finalRows = await prisma.ingredientPurchasePresentation.findMany({
      where: { businessId, ingredientId },
      select: { isActive: true, isDefault: true },
    });
    const active = finalRows.filter((row) => row.isActive);
    expect(active.length).toBeGreaterThan(0);
    expect(active.filter((row) => row.isDefault)).toHaveLength(1);
  });
});
