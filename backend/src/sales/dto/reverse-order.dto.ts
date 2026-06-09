import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

