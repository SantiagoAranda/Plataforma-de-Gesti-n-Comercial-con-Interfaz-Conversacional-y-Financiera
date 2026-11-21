import { BadRequestException } from '@nestjs/common';

/**
 * Public (unauthenticated) view of an Item. Every public response that carries
 * an item price must go through these helpers (store, reservations, and the
 * Fase 3 quotation views): the internal price exists but may be hidden.
 */
export const isPriceHidden = (item: { publishWithoutPrice?: boolean | null }) =>
  item.publishWithoutPrice === true;

export const publicItemPrice = (item: {
  price: unknown;
  publishWithoutPrice?: boolean | null;
}) => (isPriceHidden(item) ? null : Number(item.price));

const INTERNAL_ONLY_FIELDS = [
  'barcode',
  'quotationDescription',
  'includeInQuotation',
  'visibleInCatalog',
] as const;

export function toPublicItem<
  T extends { price: unknown; publishWithoutPrice?: boolean | null },
>(item: T) {
  const rest: Record<string, unknown> = { ...item };
  for (const field of INTERNAL_ONLY_FIELDS) delete rest[field];
  return {
    ...(rest as Omit<T, (typeof INTERNAL_ONLY_FIELDS)[number]>),
    price: publicItemPrice(item),
  };
}

/** A public commercial operation cannot be priced with a hidden internal price. */
export function assertNoHiddenPrices(
  items: Array<{ id: string; publishWithoutPrice?: boolean | null }>,
) {
  const itemIds = items.filter(isPriceHidden).map((item) => item.id);
  if (itemIds.length) {
    throw new BadRequestException({
      code: 'PRICE_ON_REQUEST',
      message: 'Hay productos con precio a consultar',
      itemIds,
    });
  }
}
