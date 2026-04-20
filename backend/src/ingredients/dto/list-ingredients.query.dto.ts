import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IngredientStatus } from '@prisma/client';

export class ListIngredientsQueryDto {
  @IsOptional()
  @IsEnum(IngredientStatus)
  status?: IngredientStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
