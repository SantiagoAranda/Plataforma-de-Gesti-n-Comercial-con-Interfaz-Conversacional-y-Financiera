import { PushPlatform } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth!: string;
}

class BrowserPushSubscriptionDto {
  @IsString()
  @MaxLength(4096)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8_640_000_000_000_000)
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class RegisterPushSubscriptionDto {
  @IsUUID()
  deviceId!: string;

  @ValidateNested()
  @Type(() => BrowserPushSubscriptionDto)
  subscription!: BrowserPushSubscriptionDto;

  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
