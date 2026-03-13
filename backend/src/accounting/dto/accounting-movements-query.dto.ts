import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { AccountingMovementOriginType } from '@prisma/client';

export class AccountingMovementsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  pucSubcuentaId?: string;

  @IsOptional()
  @IsEnum(AccountingMovementOriginType)
  originType?: AccountingMovementOriginType;

  @IsOptional()
  @IsString()
  search?: string;
}
