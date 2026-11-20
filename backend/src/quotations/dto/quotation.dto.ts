import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuotationLineDto {
  /** Producto del catálogo. Sin él, la línea es libre y exige `name`. */
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  /** Omitido = precio del catálogo (o «consultar precio» si el producto lo oculta). null = «consultar precio». */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999999)
  unitPrice?: number | null;
}

class QuotationFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerWhatsapp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  validityDays?: number;
}

export class CreateQuotationDto extends QuotationFieldsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  items!: QuotationLineDto[];

  /** Evita duplicar la cotización si se pierde la respuesta y se reintenta. */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}

export class UpdateQuotationDto extends QuotationFieldsDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  items?: QuotationLineDto[];
}
