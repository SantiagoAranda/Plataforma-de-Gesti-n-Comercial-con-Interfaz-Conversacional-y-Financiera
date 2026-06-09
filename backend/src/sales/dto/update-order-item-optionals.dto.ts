import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateOrderItemOptionalsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  excludedOptionalIngredientIds: string[];
}
