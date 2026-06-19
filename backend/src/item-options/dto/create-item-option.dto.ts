import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ItemOptionTargetType } from '@prisma/client';

export class CreateItemOptionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ItemOptionTargetType)
  targetType: ItemOptionTargetType;

  @IsOptional()
  @IsString()
  ingredientId?: string | null;

  @IsOptional()
  @IsString()
  itemId?: string | null;

  @IsOptional()
  quantity?: string | number | null;

  @IsOptional()
  @IsString()
  unitId?: string | null;

  @IsOptional()
  priceDelta?: string | number;

  @IsOptional()
  @IsBoolean()
  selectedByDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  removable?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
