import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { InventoryMode, ItemType, Weekday } from '@prisma/client';
export class ScheduleInput {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsNumber()
  startMinute!: number;

  @IsNumber()
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
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleInput)
  schedule?: ScheduleInput[];
}
