import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  PaymentMethod,
  PayrollBenefitPaymentType,
  PayrollPaymentStatus,
  PayrollPaymentType,
} from '@prisma/client';

export class CreatePayrollPaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(PayrollPaymentType)
  type?: PayrollPaymentType;

  @IsOptional()
  @IsInt()
  installmentNumber?: number | null;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

}

export class UpdatePayrollPaymentStatusDto {
  @IsEnum(PayrollPaymentStatus)
  status: PayrollPaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

}

export class CreatePayrollBenefitPaymentDto {
  @IsEnum(PayrollBenefitPaymentType)
  type: PayrollBenefitPaymentType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsInt()
  semester?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PayrollPaymentStatus)
  status?: PayrollPaymentStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  payrollRunId?: string;

  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  regularizeMissingProvision?: boolean;
}
