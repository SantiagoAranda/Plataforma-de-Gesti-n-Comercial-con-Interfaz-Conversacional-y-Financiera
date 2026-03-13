import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AccountingMovementOriginType, MovementNature } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateAccountingMovementDto {
  @IsString()
  pucSubcuentaId: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsEnum(MovementNature)
  nature: MovementNature;

  @IsDateString()
  date: string;

  @IsString()
  detail: string;

  @IsEnum(["MANUAL", "ORDER"])
  originType: "MANUAL" | "ORDER";

  @IsOptional()
  @IsString()
  originId?: string;
}