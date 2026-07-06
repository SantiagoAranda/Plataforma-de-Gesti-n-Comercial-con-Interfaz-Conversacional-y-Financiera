import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
