import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

export class InventoryKardexGlobalQueryDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  ingredientId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  limit?: number;
}

