import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesOrderLineInputDto } from './order-line-input.dto';

export class BuyerFiscalContextDto {
  @IsOptional()
  @IsIn(['NATURAL', 'JURIDICA'])
  buyerType?: 'NATURAL' | 'JURIDICA';

  @IsOptional()
  @IsString()
  buyerName?: string | null;

  @IsOptional()
  @IsIn(['CC', 'NIT', 'CE', 'PASAPORTE', 'TI'])
  buyerDocumentType?: 'CC' | 'NIT' | 'CE' | 'PASAPORTE' | 'TI';

  @IsOptional()
  @IsString()
  buyerDocumentNumber?: string | null;

  @IsOptional()
  @IsString()
  buyerEmail?: string | null;

  @IsOptional()
  @IsBoolean()
  buyerIsIvaResponsable?: boolean;

  @IsOptional()
  @IsBoolean()
  buyerIsRetenedor?: boolean;

  @IsOptional()
  @IsBoolean()
  buyerIsGranContribuyente?: boolean;

  @IsOptional()
  @IsBoolean()
  buyerIsAutorretenedor?: boolean;

  @IsOptional()
  @IsBoolean()
  buyerIsRegimenSimple?: boolean;

  @IsOptional()
  @IsBoolean()
  withholdingSubjectIsDeclarante?: boolean;

  @IsOptional()
  @IsString()
  fiscalMunicipalityCode?: string | null;

  @IsOptional()
  @IsIn(['GOODS', 'SERVICES', 'HONORARIOS', 'ARRENDAMIENTOS', 'FOOD_BEVERAGES', 'OTHER'])
  saleConcept?: 'GOODS' | 'SERVICES' | 'HONORARIOS' | 'ARRENDAMIENTOS' | 'FOOD_BEVERAGES' | 'OTHER';
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerWhatsapp?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'])
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';

  @IsOptional()
  @IsIn(['MANUAL', 'PUBLIC_STORE'])
  origin?: 'MANUAL' | 'PUBLIC_STORE';

  @IsString()
  @IsIn(['PRODUCTO', 'SERVICIO'])
  type: 'PRODUCTO' | 'SERVICIO';

  @IsString()
  @IsIn(['PENDIENTE', 'CERRADO'])
  status: 'PENDIENTE' | 'CERRADO';

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  items: SalesOrderLineInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BuyerFiscalContextDto)
  buyerFiscalContext?: BuyerFiscalContextDto;
}
