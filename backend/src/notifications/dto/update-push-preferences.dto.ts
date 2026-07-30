import { IsBoolean } from 'class-validator';

export class UpdatePushPreferencesDto {
  @IsBoolean()
  notifyOnAutomaticSale!: boolean;
}
