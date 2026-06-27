import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PayrollContractType, PayrollPaymentCycle } from '@prisma/client';

export class CreateEmployeeContractDto {
  @IsEnum(PayrollContractType)
  contractType!: PayrollContractType;

  @IsNumber()
  @Min(0)
  salaryMonthly!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  @IsOptional()
  @IsBoolean()
  applyLaw1819?: boolean;

  @IsEnum(PayrollPaymentCycle)
  paymentCycle!: PayrollPaymentCycle;

  @IsOptional()
  @IsInt()
  @Min(1)
  installmentsCount?: number;

  @IsOptional()
  @IsString()
  arlRiskClassId?: string;

}

export class UpdateEmployeeContractDto {
  @IsOptional()
  @IsEnum(PayrollContractType)
  contractType?: PayrollContractType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMonthly?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  @IsOptional()
  @IsBoolean()
  applyLaw1819?: boolean;

  @IsOptional()
  @IsEnum(PayrollPaymentCycle)
  paymentCycle?: PayrollPaymentCycle;

  @IsOptional()
  @IsInt()
  @Min(1)
  installmentsCount?: number;

  @IsOptional()
  @IsString()
  arlRiskClassId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
