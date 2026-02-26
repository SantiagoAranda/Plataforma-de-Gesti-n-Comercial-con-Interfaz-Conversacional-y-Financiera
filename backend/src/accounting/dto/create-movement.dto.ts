// src/accounting/dto/create-movement.dto.ts
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum MovementNature {
    DEBIT = 'DEBIT',
    CREDIT = 'CREDIT',
}

export class CreateMovementDto {
    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    memo?: string;

    @ValidateIf(o => !o.pucSubCode)
    @IsString()
    @IsNotEmpty()
    pucCuentaCode?: string;

    @ValidateIf(o => !o.pucCuentaCode)
    @IsString()
    @IsNotEmpty()
    pucSubCode?: string;

    @IsEnum(MovementNature)
    nature: MovementNature;

    @IsNumber()
    @Min(0.0000001)
    @Transform(({ value }) => Number(value))
    amount: number;

    @IsOptional()
    @IsString()
    description?: string;
}