import { BadRequestException } from '@nestjs/common';
import { generateSlug as normalizeLegacySlug } from './slug.util';

// Root segments from frontend/app and backend controllers; api is infrastructure,
// registro is the reserved Spanish registration alias. Match whole identifiers only.
export const RESERVED_BUSINESS_SLUGS = new Set([
  'accounting', 'admin', 'api', 'auth', 'businesses', 'carrito', 'configuracion',
  'contabilidad', 'fiscal-documents', 'forgot-password', 'home', 'ingredients',
  'inventario', 'inventory', 'items', 'login', 'mi-negocio', 'movements',
  'movimientos', 'nomina', 'notifications', 'orden', 'payroll', 'perfil',
  'products', 'public', 'recipes', 'register', 'registro', 'reserva',
  'reservations', 'reset-password', 'sales', 'settings', 'tax', 'tienda', 'users', 'venta',
]);
export const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateCustomBusinessSlug(value: unknown): string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 50 ||
      !BUSINESS_SLUG_PATTERN.test(value)) {
    throw new BadRequestException('El identificador debe tener entre 3 y 50 caracteres: letras minúsculas, números y guiones intermedios sin repetir.');
  }
  if (RESERVED_BUSINESS_SLUGS.has(value)) {
    throw new BadRequestException('Este identificador está reservado por el sistema.');
  }
  return value;
}

export async function generateBusinessSlug(
  name: string,
  isAvailable: (slug: string) => Promise<boolean>,
): Promise<string> {
  let base = (await normalizeLegacySlug(name)).replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-+$/g, '');
  if (base.length < 3) base = 'negocio';
  for (let variant = 1; ; variant++) {
    const suffix = variant === 1 ? '' : `-${variant}`;
    const candidate = base.slice(0, 50 - suffix.length).replace(/-+$/g, '') + suffix;
    if (!RESERVED_BUSINESS_SLUGS.has(candidate) && await isAvailable(candidate)) {
      return validateCustomBusinessSlug(candidate);
    }
  }
}

// Retry outside the transaction: PostgreSQL aborts a transaction after a unique violation.
export async function retryBusinessSlugTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      const failure = error as { code?: string; meta?: { target?: string[] | string; modelName?: string } };
      const target = failure?.meta?.target;
      const fields = Array.isArray(target) ? target : [target];
      const slugConflict = failure?.code === 'P2002' && fields.length === 1 &&
        ['slug', 'Business_slug_key', 'BusinessSlug_pkey'].includes(fields[0] ?? '') &&
        (!failure.meta?.modelName || ['Business', 'BusinessSlug'].includes(failure.meta.modelName));
      if (!slugConflict && failure?.code !== 'P2034') throw error;
      if (attempt >= 4) {
        throw new BadRequestException('No se pudo reservar el identificador del negocio. Intentá nuevamente.');
      }
    }
  }
}
