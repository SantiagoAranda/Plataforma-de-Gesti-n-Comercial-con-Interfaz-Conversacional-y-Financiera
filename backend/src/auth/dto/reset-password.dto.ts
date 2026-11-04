import { IsString, Matches, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;

  @IsString()
  @MaxLength(2048)
  password: string;
}
