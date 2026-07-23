/**
 * Formatea un número como moneda en pesos argentinos (ARS).
 * Ejemplo: 1000 -> 1.000,00
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantityCompact(value: number | string | null | undefined, maximumFractionDigits = 6): string {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numericValue);
}

/**
 * Trunca un texto a un límite de caracteres, agregando puntos suspensivos si es necesario.
 */
export function truncateText(text: string, limit = 90): string {
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit).trim() + "...";
}
