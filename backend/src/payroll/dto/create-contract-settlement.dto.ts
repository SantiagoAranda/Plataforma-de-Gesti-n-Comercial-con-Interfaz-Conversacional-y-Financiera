import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PayrollTerminationReason } from '@prisma/client';

export class CreateContractSettlementDto {
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  calculationYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryConceptsAmount?: number;

  /** Informative only: never changes amounts, concepts or accounting. */
  @IsEnum(PayrollTerminationReason)
  terminationReason: PayrollTerminationReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terminationNote?: string;
}
