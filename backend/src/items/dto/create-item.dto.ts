import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { InventoryMode, ItemType, Weekday } from '@prisma/client';

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
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsString()
  name!: string;

  @IsNumber()
  price!: number;

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
