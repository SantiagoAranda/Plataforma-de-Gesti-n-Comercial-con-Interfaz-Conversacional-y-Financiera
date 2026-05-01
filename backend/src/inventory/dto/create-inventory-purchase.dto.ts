import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateInventoryPurchaseDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  // Legacy mode: quantity + unitCost represent values in consumption units.
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  quantity?: number;

  // Legacy mode: unitCost is cost per consumption unit.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  unitCost?: number;

  // New mode: purchaseQuantity + purchaseUnitCost represent values in purchase units.
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  purchaseQuantity?: number;

  // New mode: purchaseUnitCost is cost per purchase unit.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  purchaseUnitCost?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  detail?: string;
}
