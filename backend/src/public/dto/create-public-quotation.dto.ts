import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class PublicQuotationLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

/** Solo ids y cantidades: precios, nombres y descripciones los pone siempre el catálogo. */
export class CreatePublicQuotationDto {
  @IsUUID()
  idempotencyKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  customerWhatsapp: string;

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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PublicQuotationLineDto)
  items: PublicQuotationLineDto[];
}
