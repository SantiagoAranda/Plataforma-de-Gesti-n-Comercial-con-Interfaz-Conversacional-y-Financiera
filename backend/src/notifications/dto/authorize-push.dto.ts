import { IsString, IsUUID } from 'class-validator';

export class AuthorizePushDto {
  @IsUUID()
  deviceId!: string;

  // No length cap: historical login passwords are accepted at any length.
  @IsString()
  password!: string;
}
