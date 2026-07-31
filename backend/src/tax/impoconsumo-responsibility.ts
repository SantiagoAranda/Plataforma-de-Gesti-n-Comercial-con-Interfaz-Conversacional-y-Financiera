export function assertSellerImpoconsumoResponsibility(
  appliesImpoconsumo: boolean,
  responsibility: boolean | null,
) {
  if (!appliesImpoconsumo) return;
  if (responsibility === null) {
    throw Object.assign(
      new Error('Seller impoconsumo responsibility is unconfirmed'),
      { code: 'SELLER_IMPOCONSUMO_RESPONSIBILITY_UNCONFIRMED' },
    );
  }
  if (!responsibility) {
    throw Object.assign(
      new Error('Seller is not responsible for impoconsumo'),
      { code: 'SELLER_NOT_RESPONSIBLE_FOR_IMPOCONSUMO' },
    );
  }
}
