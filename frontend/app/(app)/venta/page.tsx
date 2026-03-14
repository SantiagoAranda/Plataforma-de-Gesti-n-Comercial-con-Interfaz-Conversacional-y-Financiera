"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesSearchBar from "@/src/components/sales/SalesSearchBar";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";

import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import { confirmSale, listSales, type ApiOrder } from "@/src/services/sales";

function mapOrderToSale(order: ApiOrder): Sale {
  const type =
    order.items.some((i) => i.item.type === "SERVICE")
      ? "SERVICIO"
      : "PRODUCTO";

const statusMap: Record<ApiOrder["status"], Sale["status"]> = {
  DRAFT: "PENDIENTE",
  SENT: "PENDIENTE DE CIERRE",
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
    origin: order.sentAt ? "ORDEN PUBLICA" : "VENTA INTERNA",
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
  const [confirmingSaleId, setConfirmingSaleId] = useState<string | null>(null);

  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await listSales();
      setSales(data.map(mapOrderToSale));
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar las ventas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  const handleConfirmSale = useCallback(async (sale: Sale) => {
    try {
      setConfirmingSaleId(sale.id);
      setError(null);

      const result = await confirmSale(sale.id);
      const updatedSale = mapOrderToSale(result.order);

      setSales((prev) =>
        prev.map((current) => (current.id === updatedSale.id ? updatedSale : current))
      );
      setDetailsSale(updatedSale);
    } catch (err) {
      console.error(err);
      setError("No se pudo finalizar la venta");
      await loadOrders();
    } finally {
      setConfirmingSaleId(null);
    }
  }, [loadOrders]);

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
        onConfirm={handleConfirmSale}
        confirming={confirmingSaleId === detailsSale?.id}
      />
    </div>
  );
}
