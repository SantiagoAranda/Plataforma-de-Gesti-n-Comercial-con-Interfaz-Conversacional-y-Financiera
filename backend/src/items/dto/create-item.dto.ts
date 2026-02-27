import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { ItemType, Weekday } from '@prisma/client';
class ScheduleInput {
  @IsEnum(Weekday)
  weekday: Weekday;

  @IsNumber()
  startMinute: number;

  @IsNumber()
  endMinute: number;
}

export class CreateItemDto {
  @IsEnum(ItemType)
  type: ItemType;

  @IsString()
  name: string;

  @IsNumber()
  price: number;

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