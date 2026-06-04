import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PayrollOvertimeInputDto {
  @IsString()
  @IsNotEmpty()
  type: string;

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
  @IsNumber()
  @Min(0)
  loanDeduction?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollOvertimeInputDto)
  overtimeHours?: PayrollOvertimeInputDto[];
}
