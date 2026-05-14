import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class CreateInventoryAdjustmentDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'quantity must be a valid decimal number' })
  quantity!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'unitCost must be a valid decimal number' })
  unitCost?: string;

  @IsString()
  @IsNotEmpty()
  detail!: string;
}
