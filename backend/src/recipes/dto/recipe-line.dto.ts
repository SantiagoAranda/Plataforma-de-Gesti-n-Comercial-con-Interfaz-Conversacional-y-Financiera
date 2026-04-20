import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecipeLineDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  quantityRequired!: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isOptional?: boolean;
}
