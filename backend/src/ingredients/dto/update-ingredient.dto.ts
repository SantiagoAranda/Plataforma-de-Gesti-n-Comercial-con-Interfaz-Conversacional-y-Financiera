import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { IngredientStatus } from '@prisma/client';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(IngredientStatus)
  status?: IngredientStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  consumptionUnit?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  purchaseUnit?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'purchaseToConsumptionFactor must be a valid decimal number',
  })
  purchaseToConsumptionFactor?: string;
}
