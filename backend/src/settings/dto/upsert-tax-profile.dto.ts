import { IsString, IsOptional, IsEnum, IsArray, IsEmail, IsBoolean } from 'class-validator';
import { PersonType, DocumentType } from '@prisma/client';

export class UpsertTaxProfileDto {
  @IsEnum(PersonType)
  personType!: PersonType;

  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  nit!: string;

  @IsOptional()
  @IsString()
  dv?: string;

  @IsString()
  tradeName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  departmentCode!: string;

  @IsString()
  municipalityCode!: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  mainCiiuCode?: string;

  @IsOptional()
  @IsString()
  mainCiiuDescription?: string;

  @IsOptional()
  @IsBoolean()
  isIncomeTaxDeclarant?: boolean;

  @IsArray()
  @IsString({ each: true })
  responsibilityCodes!: string[];
}
