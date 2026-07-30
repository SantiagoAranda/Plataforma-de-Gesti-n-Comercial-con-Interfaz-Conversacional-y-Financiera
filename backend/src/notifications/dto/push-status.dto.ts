import { IsUUID } from 'class-validator';

export class PushStatusDto {
  @IsUUID()
  deviceId!: string;
}
