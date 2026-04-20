import { IsEnum, IsOptional } from 'class-validator';
import { IngredientStatus } from '@prisma/client';

export class InventorySummaryQueryDto {
  @IsOptional()
  @IsEnum(IngredientStatus)
  status?: IngredientStatus;
}
