// src/accounting/dto/update-entry.dto.ts
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLineDto } from './create-line.dto';

export class UpdateEntryDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    memo?: string;

    /**
     * Si viene, reemplaza TODAS las líneas.
     * Si no viene, solo actualiza date/memo.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateLineDto)
    lines?: CreateLineDto[];
}