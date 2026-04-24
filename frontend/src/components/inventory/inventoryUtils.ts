export function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

export function clampMin(value: number, min: number) {
  return value < min ? min : value;
}

