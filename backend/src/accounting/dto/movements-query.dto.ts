// src/accounting/dto/movements-query.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class MovementsQueryDto {
    @IsOptional()
    @IsString()
    status?: string; // DRAFT|POSTED|VOID

    @IsOptional()
    @IsString()
    from?: string; // ISO

    @IsOptional()
    @IsString()
    to?: string; // ISO

    @IsOptional()
    @IsString()
    q?: string; // texto (memo/description/codes)

    @IsOptional()
    @IsString()
    pucCode?: string; // contains

    @IsOptional()
    @IsIn(['true', 'false'])
    onlyPosted?: 'true' | 'false';
}