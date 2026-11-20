import { ITEM_CATEGORIES, OTHER_CATEGORY_ID } from "./itemCategories";

export type CategoryChoice = { categoryId: string; subcategoryId: string | null };

export const normalizeText = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const A = "alimentos-y-bebidas";
/**
 * The 18 rules of the prototype's CATEGORY_KEYWORDS (docs/archivos-interfaz/Nuevo Productos Ajustes.html), as ids.
 * Terms are normalized whole words (also matched with an "s"/"es" plural); "stem*" matches a word that starts with stem;
 * a term with a space is a whole phrase. "alcohol" was dropped: «Alcohol antiséptico» would suggest liquor.
 * `unless` terms (same syntax) cancel the rule: explicit exclusions for known false positives.
 */
export const CATEGORY_RULES: ReadonlyArray<{ terms: string[]; unless?: string[] } & CategoryChoice> = [
  { categoryId: A, subcategoryId: `${A}/snacks-y-pasabocas`, terms: ["snack*", "pasabocas", "papas fritas", "aperitiv*"] },
  { categoryId: A, subcategoryId: `${A}/licores-y-cervezas`, terms: ["cerveza", "vino", "licor*", "whisk*", "ron", "aguardiente", "beer", "wine"] },
  { categoryId: A, subcategoryId: `${A}/bebidas-sin-alcohol`, terms: ["bebida", "beverage", "gaseosa", "soda", "jugo", "juice", "agua", "water", "refresco"] },
  { categoryId: A, subcategoryId: `${A}/lacteos-y-huevos`, terms: ["leche", "lacteo*", "queso", "yogur*", "mantequilla", "dairy", "huevo", "egg"] },
  { categoryId: A, subcategoryId: `${A}/carnes-pescados-y-embutidos`, terms: ["carne", "embutido", "jamon", "salchicha", "pollo", "pescado", "atun", "meat", "fish"] },
  { categoryId: A, subcategoryId: `${A}/frutas-y-verduras`, terms: ["fruta", "verdura", "vegetal", "hortaliza", "fruit"] },
  { categoryId: A, subcategoryId: `${A}/panaderia-y-galletas`, terms: ["panader*", "galleta", "bizcocho", "pastel", "reposter*", "biscuit", "bread", "pan"] },
  { categoryId: A, subcategoryId: `${A}/dulces-y-chocolates`, terms: ["chocolate", "dulce", "caramelo", "confiter*", "golosina", "candy", "sweet"] },
  { categoryId: A, subcategoryId: `${A}/cereales-y-desayuno`, terms: ["cereal", "desayuno", "breakfast"] },
  { categoryId: A, subcategoryId: `${A}/cafe-te-e-infusiones`, terms: ["cafe", "coffee", "te", "tea", "infusi*"] },
  { categoryId: A, subcategoryId: `${A}/aceites-salsas-y-condimentos`, terms: ["aceite", "salsa", "condiment*", "especia", "vinagre", "sauce", "oil"], unless: ["clase", "baile", "bailar"] },
  { categoryId: A, subcategoryId: `${A}/despensa-y-granos`, terms: ["arroz", "pasta", "grano", "legumbre", "harina", "enlatado", "conserva", "despensa", "rice", "flour"], unless: ["dental", "diente"] },
  { categoryId: A, subcategoryId: `${A}/congelados-y-helados`, terms: ["congelad*", "helado", "frozen", "ice cream"] },
  { categoryId: A, subcategoryId: null, terms: ["aliment*", "comida", "food"] },
  { categoryId: "aseo-y-limpieza", subcategoryId: "aseo-y-limpieza/detergentes-y-jabones", terms: ["detergente", "jabon", "limpieza", "desinfect*", "cleaning"] },
  { categoryId: "belleza-y-cuidado-personal", subcategoryId: "belleza-y-cuidado-personal/cuidado-del-cabello", terms: ["shampoo", "champu", "cabello", "hair"] },
  { categoryId: "belleza-y-cuidado-personal", subcategoryId: null, terms: ["cosmetic*", "maquillaje", "crema", "piel", "skin", "beauty", "belleza", "higiene"] },
  { categoryId: "mascotas", subcategoryId: null, terms: ["mascota", "perro", "gato", "pet"], unless: ["hidraulico", "mecanico", "tonelada*"] },
];

function matches(term: string, words: string[], padded: string) {
  if (term.includes(" ")) return padded.includes(` ${term} `);
  if (term.endsWith("*")) return words.some(word => word.startsWith(term.slice(0, -1)));
  return words.some(word => word === term || word === `${term}s` || word === `${term}es`);
}

/** Suggestion only, never applied by itself. null when the name is short, unknown or spans several categories. */
export function suggestCategory(name: string): CategoryChoice | null {
  if (name.trim().length < 3) return null;
  const words = normalizeText(name).split(/[^a-z0-9]+/).filter(Boolean);
  const padded = ` ${words.join(" ")} `;
  const has = (term: string) => matches(term, words, padded);
  const hits = CATEGORY_RULES.filter(rule => rule.terms.some(has) && !rule.unless?.some(has));
  const categories = new Set(hits.map(hit => hit.categoryId));
  if (categories.size !== 1) return null;
  const subcategories = new Set(hits.map(hit => hit.subcategoryId).filter(Boolean));
  return { categoryId: hits[0].categoryId, subcategoryId: subcategories.size === 1 ? [...subcategories][0] : null };
}

export function isFixedChoice(categoryId?: string | null, subcategoryId?: string | null) {
  const category = ITEM_CATEGORIES.find(entry => entry.id === categoryId);
  return !!category && (!subcategoryId || category.subcategories.some(entry => entry.id === subcategoryId));
}

/**
 * Categories of the business's most recently saved or edited items (not a click history), newest first.
 * Fixed categories only, with or without subcategory; «Otra categoría» and stale ids are skipped.
 */
export function recentCategories(items: ReadonlyArray<{ categoryId?: string | null; subcategoryId?: string | null; updatedAt?: string }>, limit = 4) {
  const seen = new Set<string>();
  const out: CategoryChoice[] = [];
  const sorted = [...items].sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0));
  for (const item of sorted) {
    if (item.categoryId === OTHER_CATEGORY_ID || !isFixedChoice(item.categoryId, item.subcategoryId)) continue;
    const choice = { categoryId: item.categoryId!, subcategoryId: item.subcategoryId ?? null };
    const key = `${choice.categoryId}|${choice.subcategoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(choice);
    if (out.length === limit) break;
  }
  return out;
}
