import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLineDto } from './create-line.dto';

export class CreateEntryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineDto)
  lines: CreateLineDto[];
}