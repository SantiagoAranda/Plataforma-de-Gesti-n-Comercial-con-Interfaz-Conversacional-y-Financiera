import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { RecipeLineDto } from './recipe-line.dto';

export class ReplaceRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}
