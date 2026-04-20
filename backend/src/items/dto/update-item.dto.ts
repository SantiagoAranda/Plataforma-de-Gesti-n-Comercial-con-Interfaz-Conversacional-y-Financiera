import {
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";
import { Transform } from "class-transformer";
import { Type } from "class-transformer";
import { InventoryMode, ItemType } from '@prisma/client';
import { ScheduleInput } from "./create-item.dto";

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
