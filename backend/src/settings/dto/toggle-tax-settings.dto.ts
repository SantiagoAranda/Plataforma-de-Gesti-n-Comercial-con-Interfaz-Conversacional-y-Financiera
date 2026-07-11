import { IsBoolean } from 'class-validator';

export class ToggleTaxSettingsDto {
  @IsBoolean()
  taxSettingsEnabled!: boolean;
}
