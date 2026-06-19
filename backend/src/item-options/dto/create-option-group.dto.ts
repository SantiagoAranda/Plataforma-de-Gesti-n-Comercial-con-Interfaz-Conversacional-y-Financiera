import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ItemOptionQuantityMode } from '@prisma/client';

export class CreateOptionGroupDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSelections?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number | null;

  @IsEnum(ItemOptionQuantityMode)
  quantityMode: ItemOptionQuantityMode;

  @IsOptional()
  totalQuantityLimit?: string | number | null;

  @IsOptional()
  @IsString()
  totalQuantityUnitId?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
