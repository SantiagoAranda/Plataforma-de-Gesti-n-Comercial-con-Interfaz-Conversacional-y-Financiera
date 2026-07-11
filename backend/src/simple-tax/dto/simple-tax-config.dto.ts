import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { SimpleTaxFilingMode } from '@prisma/client';

export class UpsertSimpleTaxConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  taxYear!: number;

  @IsOptional()
  @IsString()
  groupCode?: string | null;

  @IsOptional()
  @IsString()
  activityLabel?: string | null;

  @IsOptional()
  @IsString()
  ciiuCode?: string | null;

  @IsOptional()
  @IsEnum(SimpleTaxFilingMode)
  filingMode?: SimpleTaxFilingMode;
}
