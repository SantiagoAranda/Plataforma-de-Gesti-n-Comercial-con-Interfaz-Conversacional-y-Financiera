import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsUUID,
  Max,
  Min,
  Matches,
  ValidateNested,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

import { Transform, Type } from 'class-transformer';
import {
  InventoryMode,
  ItemTaxTreatment,
  ItemType,
  Weekday,
  SaleConcept,
} from '@prisma/client';

class BadgeInput {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class ScheduleInput {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsNumber()
  @Type(() => Number)
  startMinute!: number;

  @IsNumber()
  @Type(() => Number)
  endMinute!: number;
}

export class CreateItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(ItemType)
  type!: ItemType;

  @IsOptional()
  @IsEnum(SaleConcept)
  saleConcept?: SaleConcept;

  @IsOptional()
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsString()
  name!: string;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsBoolean()
  appliesImpoconsumo?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  impoconsumoRate?: number | null;

  @IsOptional()
  @IsEnum(ItemTaxTreatment)
  taxTreatment?: ItemTaxTreatment;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).trim(),
  )
  fiscalCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).trim(),
  )
  unitMeasureCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).trim(),
  )
  standardCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'minStock must be a valid decimal number' })
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
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleInput)
  schedule?: ScheduleInput[];
}
