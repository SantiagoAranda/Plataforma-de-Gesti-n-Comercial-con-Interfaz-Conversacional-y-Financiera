import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class RecipeLineDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'quantityRequired must be a valid decimal number' })
  quantityRequired!: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isOptional?: boolean;
}
