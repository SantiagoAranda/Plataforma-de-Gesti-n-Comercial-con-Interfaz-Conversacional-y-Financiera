import slugify from 'slugify';

/**
 * Genera un slug seguro para URLs a partir de un texto, manejando caracteres en español.
 * Soporta un callback opcional para verificar la unicidad en la base de datos.
 */
export async function generateSlug(
  text: string,
  isUnique?: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!text) return '';

  const baseSlug = slugify(text, {
    lower: true,
    strict: true,
    trim: true,
    locale: 'es',
  });

  if (!isUnique) return baseSlug;

  let slug = baseSlug;
  let counter = 1;

  while (!(await isUnique(slug))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
