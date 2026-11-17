export type DocBusiness = {
  name: string;
  legalName: string;
  nit?: string;
  regime?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  web?: string;
};

export type DocCustomer = {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
};

export type DocLine = {
  description: string;
  code?: string;
  detail?: string;
  quantity: number;
  /** null = "Consultar precio" (Item.publishWithoutPrice): no suma al total. */
  unitPrice: number | null;
};

export type CommercialDocumentData = {
  /** Número ya asignado, p. ej. "COT-1024" u "OE-1024". */
  number: string;
  /** ISO 8601. Se muestra en hora de Bogotá. */
  issuedAt: string;
  /** Solo cotizaciones. */
  validityDays?: number;
  /** Solo órdenes de entrega: venta o cotización de origen. */
  reference?: string;
  business: DocBusiness;
  customer: DocCustomer;
  lines: DocLine[];
  /** IVA estimado o definitivo, en pesos. Opcional. */
  vatAmount?: number;
};

export type DocumentKind = "quotation" | "delivery";
export type DocumentFormat = "carta" | "ticket";
export type TicketWidth = 58 | 80;
