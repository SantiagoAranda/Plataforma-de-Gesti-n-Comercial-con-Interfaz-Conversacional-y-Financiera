import { BadRequestException } from '@nestjs/common';
import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from './item-categories.data';

const SUBCATEGORIES_BY_CATEGORY = new Map(
  ITEM_CATEGORIES.map((category) => [
    category.id,
    new Set(category.subcategories.map((sub) => sub.id)),
  ]),
);

const CATEGORY_FIELDS = [
  'categoryId',
  'subcategoryId',
  'customCategoryName',
  'customSubcategoryName',
] as const;

export type ItemCategoryInput = Partial<
  Record<(typeof CATEGORY_FIELDS)[number], string | null>
>;

/** undefined = field not sent (keep); null or blank = clear. */
export function optionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function invalidCategory(message: string): never {
  throw new BadRequestException({ code: 'INVALID_ITEM_CATEGORY', message });
}

/**
 * The four category columns move together: when any of them is sent, all are
 * recomputed from the input (missing = null). Returns undefined when none was sent.
 */
export function resolveCategoryFields(input: ItemCategoryInput) {
  if (CATEGORY_FIELDS.every((field) => input[field] === undefined)) {
    return undefined;
  }

  const categoryId = optionalText(input.categoryId) ?? null;
  const subcategoryId = optionalText(input.subcategoryId) ?? null;
  const customCategoryName = optionalText(input.customCategoryName) ?? null;
  const customSubcategoryName =
    optionalText(input.customSubcategoryName) ?? null;

  if (categoryId === null) {
    if (subcategoryId || customCategoryName || customSubcategoryName) {
      invalidCategory('Selecciona una categoría antes de la subcategoría');
    }
  } else if (categoryId === OTHER_CATEGORY_ID) {
    if (!customCategoryName) {
      invalidCategory('Escribe el nombre de la categoría personalizada');
    }
    if (subcategoryId) {
      invalidCategory(
        '«Otra categoría» solo admite una subcategoría personalizada',
      );
    }
  } else {
    const subcategories = SUBCATEGORIES_BY_CATEGORY.get(categoryId);
    if (!subcategories) invalidCategory('Categoría inválida');
    if (subcategoryId && !subcategories.has(subcategoryId)) {
      invalidCategory('La subcategoría no pertenece a la categoría elegida');
    }
    if (customCategoryName || customSubcategoryName) {
      invalidCategory(
        'Los nombres personalizados solo aplican a «Otra categoría»',
      );
    }
  }

  return {
    categoryId,
    subcategoryId,
    customCategoryName,
    customSubcategoryName,
  };
}
