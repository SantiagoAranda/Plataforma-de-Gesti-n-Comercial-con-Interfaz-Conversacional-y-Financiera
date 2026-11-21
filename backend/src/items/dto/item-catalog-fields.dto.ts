import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Flags map to NOT NULL columns: absent is allowed, null is not.
const whenSent = (_: object, value: unknown) => value !== undefined;

/** F1.1 catalog attributes shared by CreateItemDto and UpdateItemDto. */
export class ItemCatalogFieldsDto {
  @ValidateIf(whenSent)
  @IsBoolean()
  visibleInCatalog?: boolean;

  @ValidateIf(whenSent)
  @IsBoolean()
  publishWithoutPrice?: boolean;

  @ValidateIf(whenSent)
  @IsBoolean()
  includeInQuotation?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  quotationDescription?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  brand?: string | null;

  // Text, never a number: leading zeros are significant (EAN/UPC).
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[\x21-\x7E]{0,64}$/, {
    message: 'barcode must have up to 64 visible ASCII characters, no spaces',
  })
  barcode?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  categoryId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  subcategoryId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  customCategoryName?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  customSubcategoryName?: string | null;
}
