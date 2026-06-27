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
import { BuyerFiscalContextDto } from './create-order.dto';
import { SalesOrderLineInputDto } from './order-line-input.dto';

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
  @Type(() => SalesOrderLineInputDto)
  items?: SalesOrderLineInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BuyerFiscalContextDto)
  buyerFiscalContext?: BuyerFiscalContextDto;
}
