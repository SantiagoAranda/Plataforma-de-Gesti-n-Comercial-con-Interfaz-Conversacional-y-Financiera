import { IsOptional, IsString } from 'class-validator';

export class CreateComplementaryPayrollRunDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
