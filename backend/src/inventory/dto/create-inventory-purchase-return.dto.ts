import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateInventoryPurchaseReturnDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  // Quantity returned in Ingredient.consumptionUnit.
  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  quantity!: number;

  // Cost per consumption unit used to recalculate weighted average on return.
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  unitCost!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  detail?: string;
}

