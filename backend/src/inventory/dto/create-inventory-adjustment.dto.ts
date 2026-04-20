import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateInventoryAdjustmentDto {
  @IsString()
  @IsUUID()
  ingredientId!: string;

  @IsNumber()
  @Min(0.000001)
  @Transform(({ value }) => Number(value))
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => Number(value))
  unitCost?: number;

  @IsString()
  @IsNotEmpty()
  detail!: string;
}
