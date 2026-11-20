export type QuotationStatus = "OPEN" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "CONVERTED";
export type QuotationAction = "send" | "accept" | "reject" | "cancel";

export interface QuotationLine {
  id: string;
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  /** null = «Consultar precio»: no suma al total. */
  unitPrice: number | null;
  lineTotal: number | null;
}

/** Respuesta de /quotations (backend/src/quotations). Las fechas llegan en ISO 8601. */
export interface Quotation {
  id: string;
  publicToken: string;
  number: number;
  displayNumber: string;
  status: QuotationStatus;
  /** OPEN con la vigencia pasada. No es un estado: lo calcula el backend al leer. */
  expired: boolean;
  origin: "MANUAL" | "PUBLIC_STORE";
  customer: {
    name: string | null;
    whatsapp: string | null;
    email: string | null;
    document: string | null;
  };
  note: string | null;
  validityDays: number;
  validUntil: string;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  convertedAt: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  items: QuotationLine[];
  createdAt: string;
  updatedAt: string;
}
