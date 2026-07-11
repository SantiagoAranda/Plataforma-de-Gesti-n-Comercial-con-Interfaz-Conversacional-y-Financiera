import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum SimpleTaxPaymentMethod {
  CASH = 'CASH',
  BANK = 'BANK',
}

export class SimpleTaxCalculateDto {
  @Type(() => Number)
  @IsInt()
  taxYear!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  periodNumber!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  manualGrossIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  excludedIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  electronicPaymentsIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pensionContributionsDiscount?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SimpleTaxUpdatePeriodDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  manualGrossIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  excludedIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  electronicPaymentsIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pensionContributionsDiscount?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SimpleTaxPayPeriodDto {
  @IsDateString()
  paymentDate!: string;

  @IsEnum(SimpleTaxPaymentMethod)
  paymentMethod!: SimpleTaxPaymentMethod;

  @IsOptional()
  @IsIn(['110505', '111005'])
  paymentAccountCode?: '110505' | '111005';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
