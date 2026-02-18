import { IsDateString, IsInt, Min } from 'class-validator';

export class RescheduleReservationDto {
  @IsDateString()
  date: string;

  @IsInt()
  @Min(0)
  startMinute: number;

  @IsInt()
  @Min(1)
  endMinute: number;
}
