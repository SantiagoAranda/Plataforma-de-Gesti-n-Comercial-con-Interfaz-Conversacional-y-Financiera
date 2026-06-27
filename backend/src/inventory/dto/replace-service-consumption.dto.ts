import { Transform, Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class ServiceIngredientItemDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  ingredientId!: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'quantityRequired must be a valid decimal number and greater than zero' })
  quantityRequired!: string;
}

export class ReplaceServiceConsumptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceIngredientItemDto)
  ingredients!: ServiceIngredientItemDto[];
}
