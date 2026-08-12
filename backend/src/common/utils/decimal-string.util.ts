export function normalizeDecimalString(value: unknown) {
  if (value === null || value === undefined) return value as any;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.replace(',', '.');
  }
  return String(value);
}

export function isValidDecimalString(value: string) {
  // Allows non-negative decimals: "0", "10", "0.5", "10.000001"
  // Rejects: negatives, empty, exponentials, commas (should be normalized), and non-numeric input.
  return /^\d+(\.\d+)?$/.test(value);
}

