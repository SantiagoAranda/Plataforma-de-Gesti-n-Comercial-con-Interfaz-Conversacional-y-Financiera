import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InventoryMode, ItemType, SaleConcept } from '@prisma/client';
import { ScheduleInput } from './create-item.dto';
import { ItemCatalogFieldsDto } from './item-catalog-fields.dto';

class BadgeInput {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateItemDto extends ItemCatalogFieldsDto {
  @IsOptional()
  @IsEnum(ItemType)
  type?: ItemType;

  @IsOptional()
  @IsEnum(SaleConcept)
  saleConcept?: SaleConcept;

  @IsOptional()
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  // Internal price is mandatory: null must be rejected, not coerced to 0.
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @Transform(({ value }: { value: unknown }) =>
    value === null || value === undefined ? value : Number(value),
  )
  price?: number;

  @IsOptional()
  @IsBoolean()
  appliesImpoconsumo?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  impoconsumoRate?: number | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).replace(',', '.').trim(),
  )
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'minStock must be a valid decimal number',
  })
  minStock?: string;

  @IsOptional()
  @IsString()
  badgeText?: string;

  @IsOptional()
  @IsString()
  badgeColor?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BadgeInput)
  badges?: BadgeInput[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : Number(value),
  )
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleInput)
  schedule?: ScheduleInput[];
}
