import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PayrollAdjustmentType } from '@prisma/client';

export class CreatePayrollAdjustmentDto {
  @IsEnum(PayrollAdjustmentType)
  type: PayrollAdjustmentType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
