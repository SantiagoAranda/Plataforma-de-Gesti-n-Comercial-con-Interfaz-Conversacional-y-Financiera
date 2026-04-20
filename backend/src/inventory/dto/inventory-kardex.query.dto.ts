import { IsOptional, IsString } from 'class-validator';

export class InventoryKardexQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
