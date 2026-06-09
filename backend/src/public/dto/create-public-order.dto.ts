import { IsArray, IsNotEmpty, IsString, ValidateNested, IsUUID, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemInput {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  excludedOptionalIngredientIds?: string[];
}

export class CreatePublicOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerWhatsapp: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];
}
