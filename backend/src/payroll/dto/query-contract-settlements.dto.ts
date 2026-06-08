import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PayrollSettlementStatus, PayrollSettlementType } from '@prisma/client';

export class QueryContractSettlementsDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsEnum(PayrollSettlementStatus)
  status?: PayrollSettlementStatus;

  @IsOptional()
  @IsEnum(PayrollSettlementType)
  type?: PayrollSettlementType;
}
