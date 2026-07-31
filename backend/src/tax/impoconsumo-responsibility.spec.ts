import { assertSellerImpoconsumoResponsibility } from './impoconsumo-responsibility';

describe('seller impoconsumo responsibility', () => {
  it.each([
    ['VAT and INC responsible', true, true],
    ['non-VAT but INC responsible', true, true],
    ['neither responsibility and no INC item', false, false],
  ])('%s is coherent', (_name, applies, responsibility) => {
    expect(() =>
      assertSellerImpoconsumoResponsibility(applies, responsibility),
    ).not.toThrow();
  });

  it('blocks an INC item when responsibility is false', () => {
    expect(() =>
      assertSellerImpoconsumoResponsibility(true, false),
    ).toThrow(
      expect.objectContaining({
        code: 'SELLER_NOT_RESPONSIBLE_FOR_IMPOCONSUMO',
      }),
    );
  });

  it('blocks an INC item while responsibility is unconfirmed', () => {
    expect(() =>
      assertSellerImpoconsumoResponsibility(true, null),
    ).toThrow(
      expect.objectContaining({
        code: 'SELLER_IMPOCONSUMO_RESPONSIBILITY_UNCONFIRMED',
      }),
    );
  });
});
