import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateBusinessProfileDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: 'El nombre comercial debe ser un texto.' })
  @Length(1, 80, { message: 'El nombre comercial debe tener entre 1 y 80 caracteres.' })
  name: string;
}
