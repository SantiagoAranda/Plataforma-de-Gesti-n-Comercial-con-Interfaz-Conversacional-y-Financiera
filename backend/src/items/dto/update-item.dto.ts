import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Transform } from "class-transformer";
import { ItemType } from '@prisma/client';

export class UpdateItemDto {
    @IsOptional()
    @IsEnum(ItemType)
    type?: ItemType;

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
    
}
