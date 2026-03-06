import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum SalesAccountingTemplateTypeDto {
    PRODUCT = 'PRODUCT',
    SERVICE = 'SERVICE',
}

export class UpsertSalesAccountingTemplateDto {
    @IsOptional()
    @IsString()
    debitCashPucCuentaCode?: string;

    @IsOptional()
    @IsString()
    debitCashPucSubCode?: string;

    @IsOptional()
    @IsString()
    debitReceivablePucCuentaCode?: string;

    @IsOptional()
    @IsString()
    debitReceivablePucSubCode?: string;

    @IsOptional()
    @IsString()
    creditIncomePucCuentaCode?: string;

    @IsOptional()
    @IsString()
    creditIncomePucSubCode?: string;

    @IsOptional()
    @IsString()
    creditVatPucCuentaCode?: string;

    @IsOptional()
    @IsString()
    creditVatPucSubCode?: string;

    @IsOptional()
    @IsString()
    debitCostPucCuentaCode?: string;

    @IsOptional()
    @IsString()
    debitCostPucSubCode?: string;

    @IsOptional()
    @IsString()
    creditInventoryPucCuentaCode?: string;

    @IsOptional()
    @IsString()
    creditInventoryPucSubCode?: string;

    @IsBoolean()
    @Transform(({ value }) => {
        if (typeof value === 'boolean') return value;
        return String(value).toLowerCase() === 'true';
    })
    pricesIncludeVat: boolean;

    @IsNumber()
    @Min(0)
    @Max(1)
    @Transform(({ value }) => Number(value))
    vatRate: number;
}