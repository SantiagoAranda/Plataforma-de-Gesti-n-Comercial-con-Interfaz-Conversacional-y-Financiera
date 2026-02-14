export type SaleStatus = "CONFIRMADO" | "CERRADO" | "PENDIENTE";
export type SaleType = "PRODUCTO" | "SERVICIO";

export interface SaleItem {
  qty: number;
  name: string;
  price: number; // precio total de ese ítem (como en tu UI)
}

export interface Sale {
  id: string;
  customerName: string;
  type: SaleType;
  status: SaleStatus;
  items: SaleItem[];
  createdAt: string; // ISO string para simplificar
  businessWhatsapp?: string; // fallback si no hay del cliente
}
