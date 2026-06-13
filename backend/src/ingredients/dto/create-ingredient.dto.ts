import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { IngredientUnit } from '@prisma/client';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';
import { normalizeIngredientUnit } from '../ingredient-unit.util';

export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => normalizeIngredientUnit(value))
  @IsEnum(IngredientUnit)
  consumptionUnit!: IngredientUnit;

  @Transform(({ value }) => normalizeIngredientUnit(value))
  @IsEnum(IngredientUnit)
  purchaseUnit!: IngredientUnit;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsNotEmpty()
  customUnitLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (!value || value === '') ? undefined : normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'purchaseToConsumptionFactor must be a valid decimal number',
  })
  purchaseToConsumptionFactor?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (!value || value === '') ? undefined : normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'minStock must be a valid decimal number',
  })
  minStock?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  recipeUnitLabel?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (!value || value === '') ? undefined : normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'recipeUnitFactor must be a valid decimal number',
  })
  recipeUnitFactor?: string;
}
