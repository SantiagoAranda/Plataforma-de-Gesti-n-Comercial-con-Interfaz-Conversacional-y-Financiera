export type SaleStatus =
  | "PENDIENTE DE CIERRE"
  | "CERRADO"
  | "PENDIENTE"
  | "CANCELADO";

export type SaleType = "PRODUCTO" | "SERVICIO";
export type SourceType = "ORDER" | "RESERVATION";
export type PaymentMethod = "CASH" | "BANK_TRANSFER";

export interface SaleItem {
  itemId?: string;
  qty: number;
  name: string;

  // precio TOTAL de este item (qty * precio unitario)
  price: number;

  // solo para servicios
  durationMin?: number | null;
}

export interface Sale {
  id: string;
  sourceType: SourceType; // ORIGEN EXPLÍCITO

  customerName: string;
  customerWhatsapp?: string;
  paymentMethod?: PaymentMethod;

  type: SaleType;
  status: SaleStatus;

  items: SaleItem[];

  createdAt: string; // ISO

  // solo servicios
  scheduledAt?: string;

  origin?: "ORDEN PUBLICA" | "VENTA INTERNA";

  // fallback temporal
  businessWhatsapp?: string;
}
