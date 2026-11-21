/** Alturas medidas (px) de cada bloque de la hoja carta. `th` y `totals` ya sin el cuerpo base. */
export type Measures = {
  head: number;
  chead: number;
  base: number;
  side1: number;
  sideC: number;
  th: number;
  totals: number;
  bottom: number;
  foot: number;
  rows: number[];
};

export type PagePlan = { first: boolean; a: number; b: number; tail: boolean; noTable?: boolean };

export const PAGE_H = 1056;
const TOP = 40;
const SAFE = 14;

/**
 * Reparte las filas en hojas carta: la primera lleva el encabezado completo, las demás uno
 * reducido; la última lleva totales y parte inferior. Siempre hay al menos una fila por hoja.
 */
export function paginate(m: Measures): PagePlan[] {
  const cap = PAGE_H - TOP - m.foot - SAFE;
  const n = m.rows.length;
  const bodyH = (side: number, used: number, tail: boolean) =>
    Math.max(side, m.base + m.th + used + (tail ? m.totals : 0));
  const pages: PagePlan[] = [];
  let i = 0;
  let first = true;
  for (;;) {
    const top = first ? m.head : m.chead;
    const side = first ? m.side1 : m.sideC;
    const avail = cap - top - m.base - m.th;
    let used = 0;
    const a = i;
    while (i < n && used + m.rows[i] <= avail) {
      used += m.rows[i];
      i++;
    }
    if (i === a && i < n) {
      used += m.rows[i];
      i++;
    }
    if (i >= n && top + bodyH(side, used, true) + m.bottom <= cap) {
      pages.push({ first, a, b: i, tail: true });
      break;
    }
    pages.push({ first, a, b: i, tail: false });
    if (i >= n) {
      // Los totales no caben: se llevan hasta 2 filas de la hoja anterior a la última hoja.
      const prev = pages[pages.length - 1];
      let k = 0;
      let h = 0;
      while (
        k < 2 &&
        prev.b - prev.a - k > 1 &&
        m.chead + bodyH(m.sideC, h + m.rows[prev.b - k - 1], true) + m.bottom <= cap
      ) {
        h += m.rows[prev.b - k - 1];
        k++;
      }
      if (k) {
        prev.b -= k;
        pages.push({ first: false, a: prev.b, b: i, tail: true });
      } else {
        pages.push({ first: false, a: i, b: i, tail: true, noTable: true });
      }
      break;
    }
    first = false;
  }
  return pages;
}
