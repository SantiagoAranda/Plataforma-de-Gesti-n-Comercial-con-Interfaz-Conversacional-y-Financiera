import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class CreateInventoryPurchaseReturnDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  // Quantity returned in Ingredient.consumptionUnit.
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'quantity must be a valid decimal number' })
  quantity!: string;

  // Cost per consumption unit used to recalculate weighted average on return.
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'unitCost must be a valid decimal number' })
  unitCost!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  detail?: string;
}

