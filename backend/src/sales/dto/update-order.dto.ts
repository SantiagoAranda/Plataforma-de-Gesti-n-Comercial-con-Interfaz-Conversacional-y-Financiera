import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateOrderItemInput {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerWhatsapp?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'])
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemInput)
  items?: UpdateOrderItemInput[];
}
