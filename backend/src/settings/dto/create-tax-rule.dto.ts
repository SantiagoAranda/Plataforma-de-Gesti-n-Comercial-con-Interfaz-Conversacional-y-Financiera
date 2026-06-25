import { IsString, IsNumber, IsOptional, IsEnum, Min, IsBoolean } from 'class-validator';
import { TaxType, TaxDirection, SaleConcept } from '@prisma/client';

export class CreateTaxRuleDto {
  @IsEnum(TaxType)
  taxType!: TaxType;

  @IsEnum(TaxDirection)
  direction!: TaxDirection;

  @IsOptional()
  @IsString()
  ciiuCode?: string;

  @IsOptional()
  @IsEnum(SaleConcept)
  saleConcept?: SaleConcept;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsNumber()
  @Min(0)
  minBaseUvt!: number;

  @IsString()
  pucAccountCode!: string;

  @IsOptional()
  @IsBoolean()
  postToAccounting?: boolean;
}
