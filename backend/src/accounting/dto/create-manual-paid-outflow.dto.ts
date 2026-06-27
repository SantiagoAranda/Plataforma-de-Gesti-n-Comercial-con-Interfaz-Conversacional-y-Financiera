import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum ManualPaidOutflowType {
  EXPENSE = 'EXPENSE',
  COST = 'COST',
}

export enum ManualPaidOutflowPaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}

export class CreateManualPaidOutflowDto {
  @IsString()
  counterpartyName: string;

  @IsNumber()
  @Min(0.0000001)
  amount: number;

  @IsString()
  description: string;

  @IsEnum(ManualPaidOutflowPaymentMethod)
  paymentMethod: ManualPaidOutflowPaymentMethod;

  @IsEnum(ManualPaidOutflowType)
  type: ManualPaidOutflowType;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}
