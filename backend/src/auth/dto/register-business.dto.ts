import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterBusinessDto {
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
