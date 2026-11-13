import {
  IsUUID,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Mirrors the fields the public store already sends; endMinute is only a consistency check.
export class CreatePublicReservationDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio.' })
  @MaxLength(120)
  customerName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El WhatsApp del cliente es obligatorio.' })
  @MaxLength(30)
  customerWhatsapp: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato AAAA-MM-DD.',
  })
  date: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute: number;

  @IsOptional()
  @IsInt()
  endMinute?: number;

  // One random key per booking attempt, reused only by that attempt's retries.
  // Required (400 IDEMPOTENCY_KEY_REQUIRED, checked in the service with a stable code).
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
