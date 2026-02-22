import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateLineDto {
  @IsString()
  @IsNotEmpty()
  pucSubCode: string;

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