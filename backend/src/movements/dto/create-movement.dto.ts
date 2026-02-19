import { IsEnum, IsNumber, IsString, Min } from 'class-validator';

export enum MovementType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export class CreateMovementDto {
  @IsEnum(MovementType)
  type: MovementType;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  description: string;
}
