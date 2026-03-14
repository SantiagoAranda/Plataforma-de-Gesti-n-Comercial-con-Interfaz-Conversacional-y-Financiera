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

export type ApiOrder = {
  id: string;
  customerName: string;
  customerWhatsapp?: string;
  status: "DRAFT" | "SENT" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  sentAt?: string | null;
  updatedAt?: string;
  accountingPostedAt?: string | null;
  items: ApiOrderItem[];
};

export type ConfirmOrderResponse = {
  order: ApiOrder;
  accountingCreated: boolean;
  alreadyPosted: boolean;
};

export function listSales() {
  return api<ApiOrder[]>("/sales");
}

export function confirmSale(id: string) {
  return api<ConfirmOrderResponse>(`/sales/${id}/confirm`, {
    method: "PATCH",
  });
}
export function cancelSale(id: string) {
  return api<ApiOrder>(`/sales/${id}/cancel`, {
    method: "PATCH",
  });
}
export function updateSale(id: string, data: { customerName?: string; customerWhatsapp?: string; note?: string }) {
  return api<ApiOrder>(`/sales/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
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
