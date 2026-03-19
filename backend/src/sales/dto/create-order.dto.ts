import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemInput {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  customerName: string;

  @IsString()
  customerWhatsapp: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'])
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';

  @IsOptional()
  @IsIn(['MANUAL', 'PUBLIC_STORE'])
  origin?: 'MANUAL' | 'PUBLIC_STORE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];
}
