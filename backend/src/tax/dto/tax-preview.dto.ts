import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsBoolean, IsNumber, Min, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PersonType, DocumentType, SaleConcept } from '@prisma/client';

export class TaxPreviewCartItemDto {
  @IsString()
  itemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
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
  @IsString()
  fiscalMunicipalityCode?: string;

  @IsEnum(SaleConcept)
  saleConcept!: SaleConcept;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxPreviewCartItemDto)
  cartItems!: TaxPreviewCartItemDto[];
}
