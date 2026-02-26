import { IsArray, IsNotEmpty, IsString, ValidateNested, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemInput {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreatePublicOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerWhatsapp: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];
}