import type { CommercialDocumentData, DocLine } from "./types";

const business = {
  name: "SACTEC",
  legalName: "SACTEC S.A.S.",
  nit: "900.123.456-7",
  regime: "Responsable de IVA",
  address: "Calle 10 # 20-30",
  city: "Medellín, Antioquia",
  phone: "Tel. 300 000 0000",
  email: "ventas@sactec.dev",
  web: "sactec.dev",
};

const customer = {
  name: "Sebastian Jimenez Anaya",
  document: "C.C. 1.020.304.050",
  phone: "300 865 6367",
  email: "sebastian@example.com",
  address: "Carrera 45 # 22-10",
  city: "Medellín",
};

export const fixtureLines: DocLine[] = [
  { description: "Vinilo tipo 1 blanco galón", detail: "Lavable, cubrimiento alto", quantity: 4, unitPrice: 58000 },
  { description: "Rodillo de felpa 9\"", code: "ROD-09", detail: "Para muros lisos", quantity: 6, unitPrice: 14500 },
  { description: "Removedor de pintura y barniz galón, uso interior y exterior, incluye guantes y espátula de acero", quantity: 1, unitPrice: 89000 },
  { description: "Asesoría técnica de aplicación", detail: "Visita en obra", quantity: 1, unitPrice: null },
];

export function makeFixture(extraLines = 0): CommercialDocumentData {
  const more: DocLine[] = Array.from({ length: extraLines }, (_, i) => ({
    description: `Producto de prueba ${i + 1}`,
    code: `P-${String(i + 1).padStart(3, "0")}`,
    quantity: (i % 5) + 1,
    unitPrice: 12000 + i * 350,
  }));
  const lines = [...fixtureLines, ...more];
  const subtotal = lines.reduce((a, l) => a + (l.unitPrice === null ? 0 : l.quantity * l.unitPrice), 0);
  return {
    number: "COT-1024",
    issuedAt: "2026-09-27T20:13:00.000Z",
    validityDays: 15,
    reference: "F345",
    business,
    customer,
    lines,
    vatAmount: Math.round(subtotal * 0.19),
  };
}
