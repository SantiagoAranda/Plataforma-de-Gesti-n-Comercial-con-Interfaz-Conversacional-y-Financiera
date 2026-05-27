import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { PayrollWithholdingStatus } from '@prisma/client';

export class UpdateGlobalConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  smmlv?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  uvt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWorkedDaysMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSupplementaryHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  healthEmployeeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pensionEmployeeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  healthEmployerRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pensionEmployerRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compensationFundRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  senaRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  icbfRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  severanceRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  severanceInterestRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceBonusRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vacationRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  law1819ThresholdSmmlv?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportLimitSmmlv?: number;

  @IsOptional()
  @IsEnum(PayrollWithholdingStatus)
  withholdingStatus?: PayrollWithholdingStatus;
}
