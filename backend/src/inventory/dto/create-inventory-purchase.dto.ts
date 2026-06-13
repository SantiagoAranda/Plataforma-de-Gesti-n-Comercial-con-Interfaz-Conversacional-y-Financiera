import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class CreateInventoryPurchaseDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  ingredientId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  itemId?: string;

  // Legacy mode: quantity + unitCost represent values in consumption units.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'quantity must be a valid decimal number' })
  quantity?: string;

  // Legacy mode: unitCost is cost per consumption unit.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'unitCost must be a valid decimal number' })
  unitCost?: string;

  // New mode: purchaseQuantity + purchaseUnitCost represent values in purchase units.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'purchaseQuantity must be a valid decimal number' })
  purchaseQuantity?: string;

  // New mode: purchaseUnitCost is cost per purchase unit.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'purchaseUnitCost must be a valid decimal number' })
  purchaseUnitCost?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  purchaseUnitId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  detail?: string;
}
