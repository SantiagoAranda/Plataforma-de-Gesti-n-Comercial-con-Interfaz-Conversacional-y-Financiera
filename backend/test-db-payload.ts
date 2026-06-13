import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import { RecipesService } from './src/recipes/recipes.service';
import { BusinessesService } from './src/businesses/businesses.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const recipesService = app.get(RecipesService);
  const businessesService = app.get(BusinessesService);

  console.log("=== INICIANDO VALIDACIÓN DB (OPCIÓN A) ===\n");

  // 1. Setup Business
  const businessName = `Test Business ${Date.now()}`;
  const business = await businessesService.createBusiness(businessName);
  const businessId = business.id;
  console.log(`- Creado negocio de prueba: ${businessId}`);

  // 2. Setup Ingredient
  const ingredient = await prisma.ingredient.create({
    data: {
      businessId,
      name: 'Medallón de carne',
      stockUnit: 'G',
      recipeUnitLabel: 'medallón',
      recipeUnitFactor: 250,
      averageCost: 10,
    },
  });
  console.log(`- Creado insumo: ${ingredient.id} (stockUnit=G, label=medallón, factor=250)`);

  // 3. Setup Item
  const item = await prisma.item.create({
    data: {
      businessId,
      name: 'Hamburguesa',
      type: 'PRODUCT',
      inventoryMode: 'RECIPE_BASED',
      salesPrice: 5000,
      costPrice: 0,
    },
  });
  console.log(`- Creado producto de prueba: ${item.id}`);

  // --- PRUEBA 1: 1 Medallón ---
  console.log("\n--- PRUEBA 1: Cargando 1 medallón (Payload quantityRequired = 250) ---");
  await recipesService.replaceForItem(businessId, item.id, {
    lines: [
      {
        ingredientId: ingredient.id,
        quantityRequired: '250', // payload que envía el front al poner "1"
        isOptional: false,
      }
    ]
  });

  let savedRecipe = await prisma.recipe.findFirst({
    where: { itemId: item.id, ingredientId: ingredient.id }
  });

  console.log("Valor guardado en DB (RecipeIngredient):");
  console.log(savedRecipe);

  if (Number(savedRecipe?.quantityRequired) === 250) {
    console.log("✅ ÉXITO 1: quantityRequired = 250 persistido correctamente en base de datos.");
  } else {
    console.log("❌ ERROR 1: quantityRequired NO es 250.");
  }

  // --- PRUEBA 2: 2 Medallones ---
  console.log("\n--- PRUEBA 2: Cargando 2 medallones (Payload quantityRequired = 500) ---");
  await recipesService.replaceForItem(businessId, item.id, {
    lines: [
      {
        ingredientId: ingredient.id,
        quantityRequired: '500', // payload que envía el front al poner "2"
        isOptional: false,
      }
    ]
  });

  savedRecipe = await prisma.recipe.findFirst({
    where: { itemId: item.id, ingredientId: ingredient.id }
  });

  console.log("Valor guardado en DB (RecipeIngredient):");
  console.log(savedRecipe);

  if (Number(savedRecipe?.quantityRequired) === 500) {
    console.log("✅ ÉXITO 2: quantityRequired = 500 persistido correctamente en base de datos.");
  } else {
    console.log("❌ ERROR 2: quantityRequired NO es 500.");
  }

  // Limpieza final
  await prisma.recipe.deleteMany({ where: { businessId } });
  await prisma.item.deleteMany({ where: { businessId } });
  await prisma.ingredient.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
  
  await app.close();
}

bootstrap().catch(console.error);
