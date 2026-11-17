import type { DocLine } from "./types";

const TZ = "America/Bogota";

export const formatCop = (n: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));

// Node y Chrome usan espacios distintos (U+202F vs U+0020) en "p. m."; normalizar evita el error de hidratación.
const dateFmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: TZ, ...opts }).format(new Date(iso)).replace(/[\s  ]+/g, " ");

export const formatDateLong = dateFmt({ day: "numeric", month: "long", year: "numeric" });
export const formatDateShort = dateFmt({ day: "2-digit", month: "2-digit", year: "numeric" });
export const formatTime = dateFmt({ hour: "2-digit", minute: "2-digit", hour12: true });

export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function documentTotals(lines: DocLine[], vatAmount = 0) {
  let subtotal = 0;
  let units = 0;
  let unpriced = 0;
  for (const l of lines) {
    units += l.quantity;
    if (l.unitPrice === null) unpriced += 1;
    else subtotal += l.quantity * l.unitPrice;
  }
  return { subtotal, vat: vatAmount, total: subtotal + vatAmount, units, unpriced };
}

const UNITS = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function below1000(n: number) {
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const out: string[] = [];
  if (h) out.push(HUNDREDS[h]);
  if (r) out.push(r < 30 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNITS[r % 10]}` : ""));
  return out.join(" ");
}

const apocope = (t: string) => t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

/** Pesos enteros en letras, hasta 999.999.999. */
export function amountInWords(value: number) {
  const n = Math.round(value);
  if (n === 0) return "Cero pesos M/CTE";
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  const out: string[] = [];
  if (millions) out.push(millions === 1 ? "un millón" : `${apocope(below1000(millions))} millones`);
  if (thousands) out.push(thousands === 1 ? "mil" : `${apocope(below1000(thousands))} mil`);
  if (rest) out.push(apocope(below1000(rest)));
  const text = `${out.join(" ")}${n % 1e6 === 0 ? " de" : ""} pesos M/CTE`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
