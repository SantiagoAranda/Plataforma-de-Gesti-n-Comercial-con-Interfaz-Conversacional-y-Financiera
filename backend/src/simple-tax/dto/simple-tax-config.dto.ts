import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

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
}
