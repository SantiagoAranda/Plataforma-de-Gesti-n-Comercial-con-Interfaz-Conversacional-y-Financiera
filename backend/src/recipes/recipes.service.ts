import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMode, ItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceRecipeDto } from './dto/replace-recipe.dto';
import { RecipeLineDto } from './dto/recipe-line.dto';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  async getForItem(businessId: string, itemId: string) {
    await this.loadItemOrThrow(businessId, itemId);

    return this.prisma.recipe.findMany({
      where: { businessId, itemId },
      include: { ingredient: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async replaceForItem(businessId: string, itemId: string, dto: ReplaceRecipeDto) {
    const item = await this.loadItemOrThrow(businessId, itemId);
    await this.validateRecipeForItem(businessId, item, dto.lines);

    return this.prisma.$transaction(async (tx) => {
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

  private async loadItemOrThrow(businessId: string, itemId: string) {
    const item = await this.prisma.item.findFirst({
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
  ) {
    if (item.type === 'SERVICE') {
      if (lines.length > 0) {
        throw new BadRequestException('SERVICE items cannot have recipes');
      }
      return;
    }

    if (item.inventoryMode === 'NONE') {
      if (lines.length > 0) {
        throw new BadRequestException('Items with inventoryMode NONE cannot have recipes');
      }
      return;
    }

    const ingredientIds = lines.map((line) => line.ingredientId);
    const uniqueIngredientIds = new Set(ingredientIds);
    if (uniqueIngredientIds.size !== ingredientIds.length) {
      throw new BadRequestException('Recipe contains duplicate ingredients');
    }

    for (const line of lines) {
      if (line.quantityRequired <= 0) {
        throw new BadRequestException('Recipe quantityRequired must be greater than zero');
      }
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        businessId,
        id: { in: ingredientIds },
      },
      select: { id: true },
    });

    if (ingredients.length !== uniqueIngredientIds.size) {
      throw new BadRequestException('One or more ingredients are invalid');
    }

    const mandatoryCount = lines.filter((line) => !(line.isOptional ?? false)).length;

    if (item.inventoryMode === 'SIMPLE') {
      if (lines.length !== 1 || mandatoryCount !== 1 || lines.some((line) => line.isOptional)) {
        throw new BadRequestException(
          'SIMPLE items must have exactly one mandatory recipe line',
        );
      }
      return;
    }

    if (item.inventoryMode === 'RECIPE_BASED' && mandatoryCount < 1) {
      throw new BadRequestException(
        'RECIPE_BASED items must have at least one mandatory recipe line',
      );
    }
  }
}
