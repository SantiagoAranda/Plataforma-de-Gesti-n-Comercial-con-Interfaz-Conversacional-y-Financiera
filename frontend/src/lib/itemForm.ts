import { ItemCatalogAttributes } from "@/src/types/item";
import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from "./itemCategories";

export function catalogDraft(item: ItemCatalogAttributes = {}): ItemCatalogAttributes {
  return {
    visibleInCatalog: item.visibleInCatalog ?? true,
    publishWithoutPrice: item.publishWithoutPrice ?? false,
    includeInQuotation: item.includeInQuotation ?? false,
    quotationDescription: item.quotationDescription ?? null,
    brand: item.brand ?? null, barcode: item.barcode ?? null,
    categoryId: item.categoryId ?? null, subcategoryId: item.subcategoryId ?? null,
    customCategoryName: item.customCategoryName ?? null,
    customSubcategoryName: item.customSubcategoryName ?? null,
  };
}
export const isValidBarcode = (barcode?: string | null) => /^[\x21-\x7E]{0,64}$/.test(barcode?.trim() ?? "");
export function validateCatalog(draft: ItemCatalogAttributes): string | null {
  if ((draft.brand?.trim().length ?? 0) > 80) return "La marca admite hasta 80 caracteres.";
  if (!isValidBarcode(draft.barcode)) return "El código admite hasta 64 caracteres visibles, sin espacios.";
  if ((draft.quotationDescription?.trim().length ?? 0) > 400) return "La descripción de cotización admite hasta 400 caracteres.";
  if ([draft.customCategoryName, draft.customSubcategoryName].some(value => (value?.trim().length ?? 0) > 60)) return "Los nombres personalizados admiten hasta 60 caracteres.";
  if (draft.categoryId === OTHER_CATEGORY_ID) {
    if (!draft.customCategoryName?.trim()) return "Escribe la categoría personalizada.";
    if (draft.subcategoryId) return "Otra categoría admite solamente una subcategoría personalizada.";
  } else if (draft.categoryId) {
    const category = ITEM_CATEGORIES.find(entry => entry.id === draft.categoryId);
    if (!category || (draft.subcategoryId && !category.subcategories.some(entry => entry.id === draft.subcategoryId))) return "Revisa la categoría y subcategoría seleccionadas.";
    if (draft.customCategoryName || draft.customSubcategoryName) return "Los nombres personalizados requieren Otra categoría.";
  } else if (draft.subcategoryId || draft.customCategoryName || draft.customSubcategoryName) return "Selecciona primero una categoría.";
  return null;
}
export function durationInMinutes(hours: string, minutes: string): number | null {
  if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes)) return null;
  const h = Number(hours), m = Number(minutes), total = h * 60 + m;
  return Number.isSafeInteger(total) && m < 60 && total >= 5 ? total : null;
}
