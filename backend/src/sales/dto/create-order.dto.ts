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
import { SalesOrderLineInputDto } from './order-line-input.dto';

export class CreateOrderDto {
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
  @IsIn(['MANUAL', 'PUBLIC_STORE'])
  origin?: 'MANUAL' | 'PUBLIC_STORE';

  @IsString()
  @IsIn(['PRODUCTO', 'SERVICIO'])
  type: 'PRODUCTO' | 'SERVICIO';

  @IsString()
  @IsIn(['PENDIENTE', 'CERRADO'])
  status: 'PENDIENTE' | 'CERRADO';

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  items: SalesOrderLineInputDto[];
}
