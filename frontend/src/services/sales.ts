import { api } from "@/src/lib/api";

export type ApiOrderItem = {
  quantity: number;
  unitPrice: number;
  itemNameSnapshot: string;
  item: {
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
