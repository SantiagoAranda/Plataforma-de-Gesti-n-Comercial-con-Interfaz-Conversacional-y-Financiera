import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';
import { IsBusinessSlug } from './business-slug.dto';

export class RegisterBusinessDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBusinessSlug()
  slug?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  fiscalId?: string;

  @IsString()
  phoneWhatsapp: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
