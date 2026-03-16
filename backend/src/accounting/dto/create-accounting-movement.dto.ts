import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AccountingMovementOriginType, MovementNature } from '@prisma/client';

export class CreateAccountingMovementDto {
  @IsOptional()
  @IsString()
  pucSubcuentaId?: string | null;

  @IsOptional()
  @IsString()
  pucCuentaCode?: string | null;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsEnum(MovementNature)
  nature: MovementNature;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  detail?: string | null;

  @IsEnum(AccountingMovementOriginType)
  originType: AccountingMovementOriginType;

  @IsOptional()
  @IsString()
  originId?: string;
}
