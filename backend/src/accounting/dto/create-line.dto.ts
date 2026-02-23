import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateLineDto {
  @ValidateIf(o => !o.pucSubCode)
  @IsString()
  @IsNotEmpty()
  pucCuentaCode?: string;

  @ValidateIf(o => !o.pucCuentaCode)
  @IsString()
  @IsNotEmpty()
  pucSubCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  debit: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  credit: number;
}