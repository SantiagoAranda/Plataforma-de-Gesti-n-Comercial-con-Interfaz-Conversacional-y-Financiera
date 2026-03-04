export type SaleStatus =
  | "CONFIRMADO"
  | "CERRADO"
  | "PENDIENTE"
  | "CANCELADO";

export type SaleType = "PRODUCTO" | "SERVICIO";

export interface SaleItem {
  qty: number;
  name: string;

  // precio TOTAL de este item (qty * precio unitario)
  price: number;

  // solo para servicios
  durationMin?: number;
}

export interface Sale {
  id: string;

  customerName: string;
  customerWhatsapp?: string;

  type: SaleType;
  status: SaleStatus;

  items: SaleItem[];

  createdAt: string; // ISO

  // solo servicios
  scheduledAt?: string;

  // fallback temporal
  businessWhatsapp?: string;
}