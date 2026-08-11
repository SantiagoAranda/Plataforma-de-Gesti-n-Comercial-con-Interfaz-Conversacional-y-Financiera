import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMode, ItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceRecipeDto } from './dto/replace-recipe.dto';
import { RecipeLineDto } from './dto/recipe-line.dto';
import { deriveRecipeValidity } from './recipe-validity';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  private decimal(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  async getForItem(businessId: string, itemId: string) {
    await this.loadItemOrThrow(businessId, itemId);

    return this.prisma.recipe.findMany({
      where: { businessId, itemId },
      include: { ingredient: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getBulkForItems(
    businessId: string,
    itemIds: string[],
    requiresReview = false,
  ) {
    const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
    if (!uniqueItemIds.length) return {};

    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        id: { in: uniqueItemIds },
        ...(requiresReview
          ? { recipes: { some: { ingredient: { status: 'INACTIVE' } } } }
          : {}),
      },
      select: { id: true },
    });
    const allowedItemIds = items.map((item) => item.id);

    if (!allowedItemIds.length) return {};

    const recipes = await this.prisma.recipe.findMany({
      where: {
        businessId,
        itemId: { in: allowedItemIds },
      },
      include: { ingredient: true },
      orderBy: { createdAt: 'asc' },
    });

    const byItemId = Object.fromEntries(
      allowedItemIds.map((id) => [id, [] as typeof recipes]),
    );

    for (const recipe of recipes) {
      byItemId[recipe.itemId]?.push(recipe);
    }

    return byItemId;
  }

  async replaceForItem(
    businessId: string,
    itemId: string,
    dto: ReplaceRecipeDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.loadItemOrThrow(businessId, itemId, tx);
      await this.validateRecipeForItem(businessId, item, dto.lines, tx);

      await tx.recipe.deleteMany({
        where: { businessId, itemId },
      });

      if (dto.lines.length > 0) {
        await tx.recipe.createMany({
          data: dto.lines.map((line) => ({
            businessId,
            itemId,
            ingredientId: line.ingredientId,
            quantityRequired: line.quantityRequired,
            isOptional: line.isOptional ?? false,
          })),
        });
      }

      return tx.recipe.findMany({
        where: { businessId, itemId },
        include: { ingredient: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  private async loadItemOrThrow(
    businessId: string,
    itemId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const item = await tx.item.findFirst({
      where: { id: itemId, businessId },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  private async validateRecipeForItem(
    businessId: string,
    item: { id: string; type: ItemType; inventoryMode: InventoryMode },
    lines: RecipeLineDto[],
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    if (item.type === 'SERVICE') {
      if (lines.length > 0) {
        throw new BadRequestException('SERVICE items cannot have recipes');
      }
      return;
    }

    if (item.inventoryMode === 'NONE') {
      if (lines.length > 0) {
        throw new BadRequestException(
          'Items with inventoryMode NONE cannot have recipes',
        );
      }
      return;
    }

    if (item.inventoryMode === 'SIMPLE') {
      if (lines.length > 0) {
        throw new BadRequestException('SIMPLE items cannot have recipes');
      }
      return;
    }

    const ingredientIds = lines.map((line) => line.ingredientId);
    const uniqueIngredientIds = new Set(ingredientIds);
    if (uniqueIngredientIds.size !== ingredientIds.length) {
      throw new BadRequestException('Recipe contains duplicate ingredients');
    }

    for (const line of lines) {
      if (this.decimal(line.quantityRequired).lte(0)) {
        throw new BadRequestException(
          'Recipe quantityRequired must be greater than zero',
        );
      }
    }

    const sortedIngredientIds = Array.from(uniqueIngredientIds).sort();
    if (sortedIngredientIds.length > 0 && '$queryRaw' in tx) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Ingredient" WHERE "businessId" = ${businessId} AND "id" IN (${Prisma.join(sortedIngredientIds)}) ORDER BY "id" FOR KEY SHARE`,
      );
    }

    const ingredients = await tx.ingredient.findMany({
      where: {
        businessId,
        id: { in: sortedIngredientIds },
      },
      select: { id: true, name: true, status: true },
    });

    if (ingredients.length !== uniqueIngredientIds.size) {
      throw new BadRequestException('One or more ingredients are invalid');
    }

    const validity = deriveRecipeValidity(
      ingredients.map((ingredient) => ({ ingredient })),
    );
    if (validity.requiresReview) {
      throw new BadRequestException({
        code: 'INACTIVE_RECIPE_INGREDIENT',
        message: 'La receta contiene ingredientes inactivos.',
        inactiveIngredients: validity.inactiveIngredients,
      });
    }

    const mandatoryCount = lines.filter(
      (line) => !(line.isOptional ?? false),
    ).length;

    if (item.inventoryMode === 'RECIPE_BASED' && mandatoryCount < 1) {
      throw new BadRequestException(
        'RECIPE_BASED items must have at least one mandatory recipe line',
      );
    }
  }
}
