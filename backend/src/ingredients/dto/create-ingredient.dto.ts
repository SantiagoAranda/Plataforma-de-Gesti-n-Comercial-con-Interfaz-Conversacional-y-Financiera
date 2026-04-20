import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateIngredientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  consumptionUnit!: string;

  @IsString()
  @IsNotEmpty()
  purchaseUnit!: string;

  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  purchaseToConsumptionFactor!: number;
}
