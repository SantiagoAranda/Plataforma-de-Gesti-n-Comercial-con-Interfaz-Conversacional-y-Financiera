import { BadRequestException } from '@nestjs/common';
import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from './item-categories.data';
import { optionalText, resolveCategoryFields } from './item-catalog';
import { isPriceHidden, publicItemPrice, toPublicItem } from './item-public-view';

describe('item category catalog', () => {
  it('keeps exactly the prototype catalog: 28 categories, 203 subcategories', () => {
    expect(ITEM_CATEGORIES).toHaveLength(28);
    const subIds = ITEM_CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.id));
    expect(subIds).toHaveLength(203);
    expect(new Set(subIds).size).toBe(203);
    expect(new Set(ITEM_CATEGORIES.map((c) => c.id)).size).toBe(28);
    expect(ITEM_CATEGORIES.some((c) => c.id === OTHER_CATEGORY_ID)).toBe(false);
  });

  it('gives distinct ids to subcategory labels shared by Moda Mujer and Moda Hombre', () => {
    const ids = ITEM_CATEGORIES.flatMap((c) => c.subcategories)
      .filter((s) => s.label === 'Pantalones y Jeans')
      .map((s) => s.id);
    expect(ids).toEqual([
      'moda-mujer/pantalones-y-jeans',
      'moda-hombre/pantalones-y-jeans',
    ]);
  });
});

describe('resolveCategoryFields', () => {
  it('returns undefined when no category field is sent (partial update keeps them)', () => {
    expect(resolveCategoryFields({})).toBeUndefined();
  });

  it('accepts a fixed category with or without its own subcategory', () => {
    expect(
      resolveCategoryFields({
        categoryId: 'mascotas',
        subcategoryId: ITEM_CATEGORIES.find((c) => c.id === 'mascotas')!
          .subcategories[0].id,
      }),
    ).toMatchObject({ categoryId: 'mascotas', customCategoryName: null });
    expect(resolveCategoryFields({ categoryId: 'mascotas' })).toEqual({
      categoryId: 'mascotas',
      subcategoryId: null,
      customCategoryName: null,
      customSubcategoryName: null,
    });
  });

  it('accepts «Otra categoría» with custom names', () => {
    expect(
      resolveCategoryFields({
        categoryId: 'otra',
        customCategoryName: '  Repuestos náuticos ',
        customSubcategoryName: 'Hélices',
      }),
    ).toEqual({
      categoryId: 'otra',
      subcategoryId: null,
      customCategoryName: 'Repuestos náuticos',
      customSubcategoryName: 'Hélices',
    });
  });

  it('clears all four columns with categoryId null', () => {
    expect(resolveCategoryFields({ categoryId: null })).toEqual({
      categoryId: null,
      subcategoryId: null,
      customCategoryName: null,
      customSubcategoryName: null,
    });
  });

  it.each([
    ['unknown category', { categoryId: 'inventada' }],
    ['subcategory of another category', { categoryId: 'mascotas', subcategoryId: 'moda-mujer/pantalones-y-jeans' }],
    ['subcategory without category', { subcategoryId: 'moda-mujer/pantalones-y-jeans' }],
    ['other without name', { categoryId: 'otra', customCategoryName: '  ' }],
    ['other with fixed subcategory', { categoryId: 'otra', customCategoryName: 'X', subcategoryId: 'mascotas/x' }],
    ['custom name on fixed category', { categoryId: 'mascotas', customCategoryName: 'X' }],
  ])('rejects %s', (_label, input) => {
    expect(() => resolveCategoryFields(input)).toThrow(BadRequestException);
  });
});

describe('optionalText', () => {
  it('keeps undefined, clears blanks, trims and preserves leading zeros', () => {
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText(null)).toBeNull();
    expect(optionalText('   ')).toBeNull();
    expect(optionalText(' 0770030467534 ')).toBe('0770030467534');
  });
});

describe('public item view', () => {
  const item = {
    id: 'i1',
    price: '18000.00',
    publishWithoutPrice: true,
    barcode: '0770',
    quotationDescription: 'interna',
    includeInQuotation: true,
    visibleInCatalog: true,
    brand: 'Casa',
  };

  it('hides the price and internal-only fields without touching the source', () => {
    const view = toPublicItem(item);
    expect(view).toEqual({
      id: 'i1',
      price: null,
      publishWithoutPrice: true,
      brand: 'Casa',
    });
    expect(item.price).toBe('18000.00');
  });

  it('publishes the numeric price when not hidden', () => {
    expect(publicItemPrice({ ...item, publishWithoutPrice: false })).toBe(18000);
    expect(isPriceHidden({ publishWithoutPrice: false })).toBe(false);
  });
});
