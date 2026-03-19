import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  itemId: string;

  @IsString()
  customerName: string;

  @IsString()
  customerWhatsapp: string;

  @IsDateString()
  date: string;

  @IsInt()
  @Min(0)
  startMinute: number;
  @IsInt()
  @Min(1)
  endMinute: number;

  @IsOptional()
  @IsIn(['MANUAL', 'PUBLIC_STORE'])
  origin?: 'MANUAL' | 'PUBLIC_STORE';
}
