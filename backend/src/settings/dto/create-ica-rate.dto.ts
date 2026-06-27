import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateIcaRateDto {
  @IsString()
  municipalityCode!: string;

  @IsString()
  ciiuCode!: string;

  @IsOptional()
  @IsString()
  activityName?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  icaRatePerThousand!: number;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @Type(() => Number)
  reteIcaRatePerThousand!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minBaseUvt!: number;
}
