import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { normalizeDecimalString } from '../../common/utils/decimal-string.util';

export class UpsertPurchasePresentationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsUUID()
  purchaseUnitId!: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message:
      'innerQuantity must be a valid decimal number with up to 6 decimal places',
  })
  innerQuantity!: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  innerUnitLabel!: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d{1,6})?$/, {
    message:
      'contentQuantity must be a valid decimal number with up to 6 decimal places',
  })
  contentQuantity!: string;

  @IsString()
  @IsUUID()
  contentUnitId!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
