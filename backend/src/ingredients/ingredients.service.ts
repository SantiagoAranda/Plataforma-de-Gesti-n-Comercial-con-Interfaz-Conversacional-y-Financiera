import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { ListIngredientsQueryDto } from './dto/list-ingredients.query.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

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

  async create(businessId: string, dto: CreateIngredientDto) {
    const purchaseToConsumptionFactor = new Prisma.Decimal(
      dto.purchaseToConsumptionFactor,
    );
    if (purchaseToConsumptionFactor.lte(0)) {
      throw new BadRequestException(
        'purchaseToConsumptionFactor must be greater than zero',
      );
    }

    const minStock = new Prisma.Decimal(dto.minStock ?? 0);
    if (minStock.lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
    }

    try {
      return await this.prisma.ingredient.create({
        data: {
          businessId,
          name: this.normalizeText(dto.name),
          consumptionUnit: dto.consumptionUnit,
          purchaseUnit: dto.purchaseUnit,
          purchaseToConsumptionFactor,
          customUnitLabel: dto.customUnitLabel?.trim() || null,
          minStock,
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
      include: { _count: { select: { inventoryMovements: true } } },
      orderBy: { name: 'asc' },
    });

    return ingredients.map((ingredient) => this.withMovementFlags(ingredient));
  }

  async findOne(businessId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, businessId },
      include: { _count: { select: { inventoryMovements: true } } },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    return this.withMovementFlags(ingredient);
  }

  async update(businessId: string, id: string, dto: UpdateIngredientDto) {
    await this.findOne(businessId, id);

    if (
      dto.purchaseToConsumptionFactor !== undefined &&
      new Prisma.Decimal(dto.purchaseToConsumptionFactor).lte(0)
    ) {
      throw new BadRequestException(
        'purchaseToConsumptionFactor must be greater than zero',
      );
    }

    if (dto.minStock !== undefined && new Prisma.Decimal(dto.minStock).lt(0)) {
      throw new BadRequestException('minStock must be greater than or equal to zero');
    }

    try {
      return await this.prisma.ingredient.update({
        where: { id },
        data: {
          name: dto.name === undefined ? undefined : this.normalizeText(dto.name),
          status: dto.status,
          consumptionUnit:
            dto.consumptionUnit === undefined
              ? undefined
              : dto.consumptionUnit,
          purchaseUnit:
            dto.purchaseUnit === undefined
              ? undefined
              : dto.purchaseUnit,
          customUnitLabel:
            dto.customUnitLabel === undefined
              ? undefined
              : dto.customUnitLabel.trim() || null,
          purchaseToConsumptionFactor:
            dto.purchaseToConsumptionFactor === undefined
              ? undefined
              : new Prisma.Decimal(dto.purchaseToConsumptionFactor),
          minStock:
            dto.minStock === undefined ? undefined : new Prisma.Decimal(dto.minStock),
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
