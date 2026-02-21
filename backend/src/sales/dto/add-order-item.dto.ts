import { IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class AddOrderItemDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}