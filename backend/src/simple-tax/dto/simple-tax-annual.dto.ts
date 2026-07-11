import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SimpleTaxPaymentMethod } from './simple-tax-period.dto';

export class CalculateSimpleTaxAnnualReturnDto {
  @Type(() => Number)
  @IsInt()
  taxYear!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Ingresos manuales no puede ser negativo.' })
  manualGrossIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Ingresos excluidos no puede ser negativo.' })
  excludedIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Ingresos por pagos electronicos no puede ser negativo.' })
  electronicPaymentsIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Aportes pension no puede ser negativo.' })
  pensionContributionsDiscount?: number;
}

export class PaySimpleTaxAnnualReturnDto {
  @IsDateString()
  paymentDate!: string;

  @IsEnum(SimpleTaxPaymentMethod)
  paymentMethod!: SimpleTaxPaymentMethod;

  @IsOptional()
  @IsIn(['110505', '111005'])
  paymentAccountCode?: '110505' | '111005';

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'El monto de pago debe ser mayor a 0.' })
  paidAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
