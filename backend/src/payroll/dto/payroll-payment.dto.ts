import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PaymentMethod,
  PayrollBenefitPaymentType,
  PayrollPaymentStatus,
  PayrollPaymentType,
} from '@prisma/client';

export class PreparePayrollPeriodDto {
  @IsInt()
  @Min(1900)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsIn(['MONTHLY', 'BIWEEKLY'])
  paymentCycle: 'MONTHLY' | 'BIWEEKLY';

  @IsOptional()
  @IsInt()
  @Min(1)
  installmentNumber?: number | null;

  @IsString()
  @MaxLength(128)
  idempotencyKey: string;
}

export class QueryPayrollPreparationCandidatesDto {
  @IsInt()
  @Min(1900)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsIn(['MONTHLY', 'BIWEEKLY'])
  paymentCycle: 'MONTHLY' | 'BIWEEKLY';

  @IsOptional()
  @IsInt()
  @Min(1)
  installmentNumber?: number | null;
}

export class PreviewPayrollDto extends QueryPayrollPreparationCandidatesDto {}

export class MonthlyPayrollOverviewDto {
  @IsInt()
  @Min(1900)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class ConfirmPayrollPaymentDto extends PreparePayrollPeriodDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  employeeIds: string[];

  @IsIn(['CASH', 'BANK_TRANSFER'])
  paymentMethod: 'CASH' | 'BANK_TRANSFER';
}

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

export class CreatePayrollPaymentBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  payrollRunIds: string[];

  @IsIn(['CASH', 'BANK_TRANSFER'])
  paymentMethod: 'CASH' | 'BANK_TRANSFER';

  @IsDateString()
  paidAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @MaxLength(128)
  idempotencyKey: string;
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
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  regularizeMissingProvision?: boolean;
}
