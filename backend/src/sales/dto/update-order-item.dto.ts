import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderOptionSelectionInputDto } from './order-line-input.dto';

export class UpdateOrderItemDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderOptionSelectionInputDto)
  optionSelections?: OrderOptionSelectionInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  excludedOptionalIngredientIds?: string[];
}
