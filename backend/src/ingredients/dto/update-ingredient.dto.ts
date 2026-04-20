import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { IngredientStatus } from '@prisma/client';

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
  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  purchaseToConsumptionFactor?: number;
}
