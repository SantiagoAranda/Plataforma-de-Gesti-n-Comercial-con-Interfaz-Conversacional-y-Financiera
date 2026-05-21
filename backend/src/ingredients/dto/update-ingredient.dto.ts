import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { IngredientStatus, IngredientUnit } from '@prisma/client';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';
import { normalizeIngredientUnit } from '../ingredient-unit.util';

export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(IngredientStatus)
  status?: IngredientStatus;

  @IsOptional()
  @Transform(({ value }) => normalizeIngredientUnit(value))
  @IsEnum(IngredientUnit)
  consumptionUnit?: IngredientUnit;

  @IsOptional()
  @Transform(({ value }) => normalizeIngredientUnit(value))
  @IsEnum(IngredientUnit)
  purchaseUnit?: IngredientUnit;

  @IsOptional()
  @IsString()
  customUnitLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'purchaseToConsumptionFactor must be a valid decimal number',
  })
  purchaseToConsumptionFactor?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'minStock must be a valid decimal number' })
  minStock?: string;
}
