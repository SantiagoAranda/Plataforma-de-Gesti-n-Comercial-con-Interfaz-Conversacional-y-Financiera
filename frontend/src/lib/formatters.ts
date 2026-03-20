/**
 * Formatea un número como moneda en pesos argentinos (ARS).
 * Ejemplo: 1000 -> 1.000,00
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Trunca un texto a un límite de caracteres, agregando puntos suspensivos si es necesario.
 */
export function truncateText(text: string, limit = 90): string {
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit).trim() + "...";
}
