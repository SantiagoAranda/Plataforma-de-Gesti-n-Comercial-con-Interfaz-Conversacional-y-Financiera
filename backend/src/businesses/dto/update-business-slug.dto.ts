import { IsString } from 'class-validator';

// Format and reserved-word rules are checked by the service to return the concrete reason.
export class UpdateBusinessSlugDto {
  @IsString({ message: 'El identificador debe ser un texto.' })
  slug: string;
}
