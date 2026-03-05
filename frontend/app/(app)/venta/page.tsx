"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesSearchBar from "@/src/components/sales/SalesSearchBar";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";
import SaleEditModal from "@/src/components/sales/SaleEditModal";

import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";

type ApiOrderItem = {
  quantity: number;
  unitPrice: number;
  itemNameSnapshot: string;
  item: {
    type: "PRODUCT" | "SERVICE";
    durationMinutes?: number | null;
  };
};

type ApiOrder = {
  id: string;
  customerName: string;
  customerWhatsapp?: string;
  status: "DRAFT" | "SENT" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  items: ApiOrderItem[];
};

function mapOrderToSale(order: ApiOrder): Sale {
  const type =
    order.items.some((i) => i.item.type === "SERVICE")
      ? "SERVICIO"
      : "PRODUCTO";

const statusMap: Record<ApiOrder["status"], Sale["status"]> = {
  DRAFT: "PENDIENTE",
  SENT: "CONFIRMADO",
  CANCELLED: "CANCELADO",
  COMPLETED: "CERRADO",
};

  return {
    id: order.id,
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    type,
    status: statusMap[order.status],
    createdAt: order.createdAt,
    items: order.items.map((it) => ({
      qty: it.quantity,
      name: it.itemNameSnapshot,
      price: it.unitPrice * it.quantity,
      durationMin: it.item.durationMinutes ?? undefined,
    })),
  };
}

export default function VentaPage() {
  const [q, setQ] = useState("");

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  useEffect(() => {
    async function loadOrders() {
      try {
        setLoading(true);

        const token = localStorage.getItem("accessToken");

        const res = await fetch("http://localhost:3001/sales", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error("Error cargando ventas");

        const data: ApiOrder[] = await res.json();

        const mapped = data.map(mapOrderToSale);

        setSales(mapped);
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar las ventas");
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    if (!term) return sales;

    return sales.filter((s) => {
      if (s.customerName.toLowerCase().includes(term)) return true;

      return s.items.some((i) =>
        i.name.toLowerCase().includes(term)
      );
    });
  }, [q, sales]);

  const businessName = "Mi Negocio";

const handleSendWhatsApp = (sale: Sale) => {
  if (!sale.customerWhatsapp) {
    alert("El cliente no tiene número de WhatsApp");
    return;
  }

  const msg = formatSaleMessage({
    businessName,
    customerName: sale.customerName,
    items: sale.items,
  });

  const url = buildWhatsAppUrl(sale.customerWhatsapp, msg);

  window.open(url, "_blank");
};

  const handleSaveEdit = (updated: Sale) => {
    setSales((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <AppHeader title="Ventas" showBack />

      <div className="pb-28">
        {loading && (
          <div className="p-6 text-center text-gray-400">
            Cargando ventas...
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (
          <SalesList
            sales={filtered}
            onEdit={(sale) => setEditingSale(sale)}
            onDetails={(sale) => setDetailsSale(sale)}
            onSendWhatsApp={handleSendWhatsApp}
          />
        )}
      </div>

      <SalesSearchBar value={q} onChange={setQ} onAction={() => {}} />

      <SaleDetailsModal
        open={!!detailsSale}
        sale={detailsSale}
        onClose={() => setDetailsSale(null)}
        onEdit={(sale) => setEditingSale(sale)}
      />

      <SaleEditModal
        open={!!editingSale}
        sale={editingSale}
        onClose={() => setEditingSale(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}