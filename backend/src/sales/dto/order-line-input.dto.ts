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

export class OrderOptionSelectionInputDto {
  @IsString()
  groupId: string;

  @IsString()
  optionId: string;

  @IsString()
  @IsIn(['SELECT', 'ADD', 'REMOVE'])
  action: 'SELECT' | 'ADD' | 'REMOVE';
}

export class SalesOrderLineInputDto {
  @IsString()
  itemId: string;

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
