import { IsEnum } from 'class-validator';
import { PayrollPeriodStatus } from '@prisma/client';

export class UpdatePayrollPeriodStatusDto {
  @IsEnum(PayrollPeriodStatus)
  status: PayrollPeriodStatus;
}
