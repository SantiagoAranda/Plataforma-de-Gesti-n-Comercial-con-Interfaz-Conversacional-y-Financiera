import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

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

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'purchaseToConsumptionFactor must be a valid decimal number',
  })
  purchaseToConsumptionFactor!: string;
}
