import { IsDateString, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class SimulateContractSettlementDto {
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  calculationYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryConceptsAmount?: number;
}
