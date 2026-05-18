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

import { ItemType, Weekday } from '@prisma/client';

class BadgeInput {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  color?: string;
}
export class ScheduleInput {
  @IsEnum(Weekday)
  weekday: Weekday;

  @IsNumber()
  startMinute: number;

  @IsNumber()
  endMinute: number;
}

export class CreateItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

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
