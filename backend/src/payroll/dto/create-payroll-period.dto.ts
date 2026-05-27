import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PayrollPaymentCycle } from '@prisma/client';

export class CreatePayrollPeriodDto {
  @IsInt()
  @Min(1900)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsEnum(PayrollPaymentCycle)
  paymentCycle: PayrollPaymentCycle;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  installmentNumber?: number;
}
