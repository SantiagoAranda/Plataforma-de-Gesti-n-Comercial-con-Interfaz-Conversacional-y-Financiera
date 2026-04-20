import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateInventoryInitialDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  unitCost!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  detail?: string;
}
