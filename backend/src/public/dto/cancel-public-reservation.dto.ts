import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelPublicReservationDto {
  // Reservation.publicToken handed out only at booking time; required to cancel.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  token?: string;
}
