import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterBusinessDto {
  @IsString()
  name: string;

  @IsString()
  fiscalId: string;

  @IsString()
  phoneWhatsapp: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
