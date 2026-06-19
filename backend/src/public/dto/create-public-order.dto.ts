import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OptionSelectionInput {
  @IsUUID()
  groupId: string;

  @IsUUID()
  optionId: string;

  @IsString()
  @IsIn(['SELECT', 'ADD', 'REMOVE'])
  action: 'SELECT' | 'ADD' | 'REMOVE';
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionSelectionInput)
  optionSelections?: OptionSelectionInput[];
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
