import { IsString, MaxLength, ValidateIf, registerDecorator } from 'class-validator';
import { validateCustomBusinessSlug } from '../../common/utils/business-slug';

export function IsBusinessSlug() {
  return (object: object, propertyName: string) => registerDecorator({
    name: 'isBusinessSlug', target: object.constructor, propertyName,
    validator: {
      validate(value: unknown) { try { validateCustomBusinessSlug(value); return true; } catch { return false; } },
      defaultMessage() { return 'Identificador inválido o reservado: usá de 3 a 50 letras minúsculas, números y guiones intermedios sin repetir.'; },
    },
  });
}

export class BusinessSlugQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBusinessSlug()
  slug?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  name?: string;
}
