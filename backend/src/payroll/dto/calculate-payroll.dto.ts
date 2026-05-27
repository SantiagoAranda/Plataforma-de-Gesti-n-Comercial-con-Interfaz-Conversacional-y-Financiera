import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PayrollAdjustmentType } from '@prisma/client';

export class PayrollOvertimeInputDto {
  @IsEnum(PayrollAdjustmentType)
  type: PayrollAdjustmentType;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CalculatePayrollDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  workedDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nonSalaryBonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherDeductions?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollOvertimeInputDto)
  overtimeHours?: PayrollOvertimeInputDto[];
}
