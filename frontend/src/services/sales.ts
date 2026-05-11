import { api } from "@/src/lib/api";

export type ApiOrderItem = {
  quantity: number;
  unitPrice: number;
  itemNameSnapshot: string;
  item: {
    id: string;
    type: "PRODUCT" | "SERVICE";
    durationMinutes?: number | null;
  };
};

export interface ApiOrder {
  id: string;
  sourceType: "ORDER" | "RESERVATION";
  customerName: string | null;
  customerWhatsapp: string | null;
  paymentMethod?: "CASH" | "BANK_TRANSFER";
  total: number;
  status: "PENDIENTE" | "CERRADO" | "CANCELADO";
  origin: "MANUAL" | "PUBLIC_STORE";
  createdAt: string;
  scheduledAt?: string;
  type: "PRODUCTO" | "SERVICIO";
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    price: number;
    itemId: string;
    durationMin?: number | null;
  }>;
};

export type ConfirmOrderResponse = {
  order: any; // Could be Virtual Order or real Order
  accountingCreated: boolean;
  movements: any[];
  isReservation?: boolean;
};

export function listSales() {
  return api<ApiOrder[]>("/sales");
}

export function createSale(data: {
  customerName?: string;
  customerWhatsapp?: string;
  note?: string;
  paymentMethod?: "CASH" | "BANK_TRANSFER";
  origin?: "MANUAL" | "PUBLIC_STORE";
  items: Array<{ itemId: string; quantity: number }>;
}) {
  return api<ApiOrder>("/sales", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function confirmSale(id: string, sourceType: string = "ORDER") {
  return api<ConfirmOrderResponse>(`/sales/${id}/confirm?sourceType=${sourceType}`, {
    method: "PATCH",
  });
}
export function cancelSale(id: string, sourceType: string = "ORDER") {
  return api<ApiOrder>(`/sales/${id}/cancel?sourceType=${sourceType}`, {
    method: "PATCH",
  });
}
export function deleteSale(id: string, sourceType: string = "ORDER") {
  return api<ApiOrder>(`/sales/${id}?sourceType=${sourceType}`, {
    method: "DELETE",
  });
}
export function updateSale(
  id: string,
  data: {
    customerName?: string;
    customerWhatsapp?: string;
    note?: string;
    paymentMethod?: "CASH" | "BANK_TRANSFER";
    scheduledAt?: string;
    items?: Array<{ itemId: string; quantity: number }>;
  },
  sourceType: string = "ORDER",
) {
  return api<ApiOrder>(`/sales/${id}?sourceType=${sourceType}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function listReservationAvailability(id: string, params: { month?: string; date?: string }) {
  const qs = new URLSearchParams();
  if (params.month) qs.set("month", params.month);
  if (params.date) qs.set("date", params.date);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<string[]>(`/sales/${id}/reservation-availability${suffix}`);
}

export function addOrderItem(saleId: string, data: { itemId: string; quantity: number }) {
  return api(`/sales/${saleId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateOrderItem(saleId: string, orderItemId: string, quantity: number) {
  return api(`/sales/${saleId}/items/${orderItemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

export function removeOrderItem(saleId: string, orderItemId: string) {
  return api(`/sales/${saleId}/items/${orderItemId}`, {
    method: "DELETE",
  });
}
