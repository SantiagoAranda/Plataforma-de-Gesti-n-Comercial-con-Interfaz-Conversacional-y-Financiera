/** Public money is nullable. Never use Number(null) or a zero fallback. */
export const PRICE_ON_REQUEST = "Consultar precio";
export function publicPrice(value: unknown, hidden = false): number | null {
  if (hidden || value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function publicPriceLabel(value: number | null): string {
  if (value == null) return PRICE_ON_REQUEST;
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value).replace("COP", "$ ").replace(/\s+/g, "");
}

export function publicLinePrice(base: number | null, deltas: Array<number | null>): number | null {
  if (base == null || deltas.some((amount) => amount == null)) return null;
  return base + deltas.reduce<number>((sum, amount) => sum + amount!, 0);
}

export function publicCartTotal(lines: ReadonlyArray<{ price: number | null; quantity: number }>): number | null {
  if (lines.some((line) => line.price == null)) return null;
  return lines.reduce((sum, line) => sum + line.price! * line.quantity, 0);
}

type ConsultationLine = {
  name: string; quantity: number;
  selectedOptionNames?: string[];
  excludedOptionalIngredientNames?: string[];
};
export function consultationUrl(phone: string, business: string, lines: ReadonlyArray<ConsultationLine>): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits) || lines.length === 0) return null;
  const message = [
    `Hola, ${business}. Quisiera consultar estos productos y servicios:`,
    ...lines.map((line) => [
      `• ${line.quantity} × ${line.name}`,
      line.selectedOptionNames?.length ? `  Opciones: ${line.selectedOptionNames.join(", ")}` : "",
      line.excludedOptionalIngredientNames?.length ? `  Sin: ${line.excludedOptionalIngredientNames.join(", ")}` : "",
    ].filter(Boolean).join("\n")),
    "¿Podrían informarme los precios pendientes y la disponibilidad?",
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
