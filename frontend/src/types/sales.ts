export type SaleStatus = "CONFIRMADO" | "CERRADO" | "PENDIENTE" | "CANCELADO";
export type SaleType = "PRODUCTO" | "SERVICIO";

export interface SaleItem {
  qty: number;
  name: string;
  price: number; // precio total de ese ítem (como en tu UI)

  // ✅ Solo para servicios (si no aplica, queda undefined)
  durationMin?: number;
}

export interface Sale {
  id: string;
  customerName: string;
  customerPhone?: string;

  type: SaleType;
  status: SaleStatus;
  items: SaleItem[];
  createdAt: string; // ISO string

  // ✅ SOLO servicios: fecha/hora del turno (ISO)
  scheduledAt?: string;

  // fallback
  businessWhatsapp?: string;
}
