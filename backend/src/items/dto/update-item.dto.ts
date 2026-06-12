import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { InventoryMode, ItemType } from "@prisma/client";
import { ScheduleInput } from "./create-item.dto";

class BadgeInput {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @IsEnum(ItemType)
  type?: ItemType;

  @IsOptional()
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value === null || value === undefined || value === "" ? undefined : String(value).replace(",", ".").trim()
  )
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
  @IsInt()
  @Min(0)
  @Transform(({ value }) =>
    value === null || value === undefined || value === "" ? undefined : Number(value)
  )
  durationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleInput)
  schedule?: ScheduleInput[];
}
