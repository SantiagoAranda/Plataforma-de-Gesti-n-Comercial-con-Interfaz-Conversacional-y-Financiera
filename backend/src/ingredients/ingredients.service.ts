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
    if (dto.purchaseToConsumptionFactor <= 0) {
      throw new BadRequestException('purchaseToConsumptionFactor must be greater than zero');
    }

    try {
      return await this.prisma.ingredient.create({
        data: {
          businessId,
          name: this.normalizeText(dto.name),
          consumptionUnit: this.normalizeText(dto.consumptionUnit),
          purchaseUnit: this.normalizeText(dto.purchaseUnit),
          purchaseToConsumptionFactor: dto.purchaseToConsumptionFactor,
        },
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
    }
  }

  async findAll(businessId: string, query: ListIngredientsQueryDto) {
    const search = query.search?.trim();

    return this.prisma.ingredient.findMany({
      where: {
        businessId,
        ...(query.status ? { status: query.status } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, businessId },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    return ingredient;
  }

  async update(businessId: string, id: string, dto: UpdateIngredientDto) {
    await this.findOne(businessId, id);

    if (
      dto.purchaseToConsumptionFactor !== undefined &&
      dto.purchaseToConsumptionFactor <= 0
    ) {
      throw new BadRequestException('purchaseToConsumptionFactor must be greater than zero');
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
              : this.normalizeText(dto.consumptionUnit),
          purchaseUnit:
            dto.purchaseUnit === undefined
              ? undefined
              : this.normalizeText(dto.purchaseUnit),
          purchaseToConsumptionFactor: dto.purchaseToConsumptionFactor,
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
}
