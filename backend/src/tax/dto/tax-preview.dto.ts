import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean, IsNumber, Min, IsEmail, Matches, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PersonType, DocumentType, SaleConcept } from '@prisma/client';

const optionalTrimmed = ({ value }: { value: unknown }) =>
  value === null || value === undefined || value === ''
    ? undefined
    : String(value).trim();

export class TaxPreviewCartItemDto {
  @IsString()
  itemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class TaxPreviewDto {
  @IsOptional()
  @IsEnum(PersonType)
  buyerType?: PersonType;

  @IsOptional()
  @IsString()
  buyerName?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  buyerDocumentType?: DocumentType;

  @IsOptional()
  @IsString()
  buyerDocumentNumber?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @Transform(optionalTrimmed)
  @Matches(/^\d{1,10}$/)
  buyerDv?: string;

  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(200)
  buyerAddress?: string;

  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(30)
  buyerPhone?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrimmed({ value })?.toUpperCase())
  @Matches(/^[A-Z]{2}$/)
  buyerCountryCode?: string;

  @IsOptional()
  @Transform(optionalTrimmed)
  @Matches(/^\d+$/)
  @MaxLength(20)
  buyerMunicipalityCode?: string;

  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(50)
  buyerTributeCode?: string;

  @IsOptional()
  @IsBoolean()
  buyerIsFinalConsumer?: boolean;

  @IsBoolean()
  buyerIsIvaResponsable!: boolean;

  @IsBoolean()
  buyerIsRetenedor!: boolean;

  @IsBoolean()
  buyerIsGranContribuyente!: boolean;

  @IsBoolean()
  buyerIsAutorretenedor!: boolean;

  @IsBoolean()
  buyerIsRegimenSimple!: boolean;

  @IsOptional()
  @IsBoolean()
  buyerRequiresElectronicInvoice?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdingSubjectIsDeclarante?: boolean;

  @IsOptional()
  @IsString()
  fiscalMunicipalityCode?: string;

  @IsOptional()
  @IsEnum(SaleConcept)
  saleConcept?: SaleConcept;

  @IsOptional()
  @IsNumber()
  icaRateOverride?: number;

  @IsOptional()
  @IsNumber()
  reteIcaRateOverride?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxPreviewCartItemDto)
  cartItems!: TaxPreviewCartItemDto[];
}
