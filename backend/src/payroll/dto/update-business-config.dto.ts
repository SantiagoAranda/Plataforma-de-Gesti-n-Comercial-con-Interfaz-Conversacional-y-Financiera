import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateBusinessConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWorkedDaysMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSupplementaryHours?: number;

  @IsOptional()
  @IsBoolean()
  applyLaw1819?: boolean;

  @IsOptional()
  @IsBoolean()
  applySolidarityFund?: boolean;

  @IsOptional()
  @IsBoolean()
  applyIncomeTax?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customTransportAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customSmmlv?: number;
}
