import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseAccountingType, ExpenseCategory } from '@prisma/client';

export class UpdateExpenseReceiptDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  destinationName?: string | null;

  @IsOptional()
  @IsString()
  destinationBank?: string | null;

  @IsOptional()
  @IsString()
  destinationAccount?: string | null;

  @IsOptional()
  @IsString()
  bankName?: string | null;

  @IsOptional()
  @IsString()
  reference?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(ExpenseAccountingType)
  accountingType?: ExpenseAccountingType;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  pucCuentaCode?: string | null;

  @IsOptional()
  @IsString()
  pucSubcuentaId?: string | null;
}
