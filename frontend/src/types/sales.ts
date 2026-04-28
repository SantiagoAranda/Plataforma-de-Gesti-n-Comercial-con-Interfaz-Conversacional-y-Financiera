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

  // Precio unitario
  unitPrice: number;

  // precio TOTAL de este item (qty * precio unitario)
  price: number;

  // solo para servicios
  durationMin?: number | null;
}

export interface Sale {
  id: string;
  sourceType: SourceType; // ORIGEN EXPLÍCITO

  customerName: string | null;
  customerWhatsapp: string | null;
  paymentMethod?: PaymentMethod;

  type: SaleType;
  status: SaleStatus;

  items: SaleItem[];

  // Total de la orden calculado en backend
  total: number;

  createdAt: string; // ISO

  // solo servicios
  scheduledAt?: string;

  origin: "MANUAL" | "PUBLIC_STORE";

  // fallback temporal
  businessWhatsapp?: string;
}
