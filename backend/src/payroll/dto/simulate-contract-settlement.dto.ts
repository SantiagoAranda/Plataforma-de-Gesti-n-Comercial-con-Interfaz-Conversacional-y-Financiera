import { IsDateString, IsOptional } from 'class-validator';

export class SimulateContractSettlementDto {
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
