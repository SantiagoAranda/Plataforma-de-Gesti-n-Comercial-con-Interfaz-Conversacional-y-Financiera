import {
  PayrollEventStatus,
  PayrollEventType,
  PayrollEventUnit,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePayrollEventDto {
  @IsString()
  employeeId: string;

  @IsEnum(PayrollEventType)
  type: PayrollEventType;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsEnum(PayrollEventUnit)
  unit?: PayrollEventUnit;

  @IsOptional()
  @IsString()
  overtimeCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountOverride?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(PayrollEventStatus)
  status?: PayrollEventStatus;
}

export class UpdatePayrollEventDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number | null;

  @IsOptional()
  @IsEnum(PayrollEventUnit)
  unit?: PayrollEventUnit | null;

  @IsOptional()
  @IsString()
  overtimeCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountOverride?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsEnum(PayrollEventStatus)
  status?: PayrollEventStatus;
}
