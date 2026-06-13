import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
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
  @Matches(/^\d+(\.\d+)?$/, { message: 'innerQuantity must be a valid decimal number' })
  innerQuantity!: string;

  @IsOptional()
  @IsString()
  innerUnitLabel?: string;

  @IsString()
  @Transform(({ value }) => normalizeDecimalString(value))
  @Matches(/^\d+(\.\d+)?$/, { message: 'contentQuantity must be a valid decimal number' })
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
