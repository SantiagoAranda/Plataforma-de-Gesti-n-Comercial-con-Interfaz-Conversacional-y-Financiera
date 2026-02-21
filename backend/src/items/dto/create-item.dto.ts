import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ItemType } from '@prisma/client';
export class CreateItemDto {
  @IsEnum(ItemType)
  type: ItemType;
  
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;
  
}
