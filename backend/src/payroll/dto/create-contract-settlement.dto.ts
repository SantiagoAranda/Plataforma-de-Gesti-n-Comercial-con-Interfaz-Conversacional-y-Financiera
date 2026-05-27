import { IsDateString } from 'class-validator';

export class CreateContractSettlementDto {
  @IsDateString()
  endDate: string;
}
