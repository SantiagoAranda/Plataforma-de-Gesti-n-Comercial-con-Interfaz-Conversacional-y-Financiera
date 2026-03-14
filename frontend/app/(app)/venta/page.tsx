"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesSearchBar from "@/src/components/sales/SalesSearchBar";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";

import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import { confirmSale, listSales, cancelSale, updateSale, type ApiOrder } from "@/src/services/sales";
import SaleEditModal from "@/src/components/sales/SaleEditModal";

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
      itemId: it.item.id, // Added itemId
      qty: it.quantity,
      name: it.itemNameSnapshot,
      price: it.unitPrice * it.quantity,
      durationMin: it.item.durationMinutes ?? undefined,
    })),
  };
}

export default function VentaPage() {
  const router = useRouter(); // Initialized useRouter
  const [q, setQ] = useState("");

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSaleId, setConfirmingSaleId] = useState<string | null>(null);
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null); // Added editingSale state

  const showConfirmation = (
    title: string, 
    actionLabel: string, 
    onAction: () => void, 
    variant: 'emerald' | 'rose' = 'emerald'
  ) => {
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-4' : 'animate-out fade-out slide-out-to-top-2'} max-w-xs w-full bg-white shadow-2xl rounded-2xl border border-neutral-100 p-4 pointer-events-auto`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${variant === 'rose' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-neutral-800 leading-tight mb-3">{title}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toast.dismiss(t.id)}
                className="flex-1 h-9 rounded-xl bg-neutral-50 text-neutral-500 text-[11px] font-bold uppercase tracking-wider hover:bg-neutral-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  onAction();
                }}
                className={`flex-1 h-9 rounded-xl text-white text-[11px] font-bold uppercase tracking-wider shadow-sm transition ${variant === 'rose' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
              >
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    ), { id: 'sale-action-confirm', position: 'top-center' });
  };

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

  const businessName = typeof window !== "undefined" ? localStorage.getItem("businessName") || "Mi Negocio" : "Mi Negocio";

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

  const handleCancelSale = useCallback(async (sale: Sale) => {
    showConfirmation(
      "¿Deseás anular esta venta?",
      "Anular",
      async () => {
        try {
          setConfirmingSaleId(sale.id);
          setError(null);

          const result = await cancelSale(sale.id);
          const updatedSale = mapOrderToSale(result);

          setSales((prev) =>
            prev.map((current) => (current.id === updatedSale.id ? updatedSale : current))
          );
          
          if (detailsSale?.id === sale.id) setDetailsSale(updatedSale);
          setSelectedSale(null);
        } catch (err) {
          console.error(err);
          setError("No se pudo anular la venta");
        } finally {
          setConfirmingSaleId(null);
        }
      },
      'rose'
    );
  }, [detailsSale]);

  const handleSaveEditedSale = async (updated: Sale) => {
    try {
      setConfirmingSaleId(updated.id);
      
      const dto = {
        customerName: updated.customerName,
        customerWhatsapp: updated.customerWhatsapp,
        items: updated.items
          .filter(it => it.itemId)
          .map(it => ({
            itemId: it.itemId!,
            quantity: it.qty
          }))
      };

      await updateSale(updated.id, dto);
      await loadOrders();
      setEditingSale(null);
      if (detailsSale?.id === updated.id) {
        setDetailsSale(null); // refresh details on next open
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo actualizar la venta");
    } finally {
      setConfirmingSaleId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      {selectedSale ? (
        <SelectionActionBar
          visible
          title="Venta seleccionada"
          onClose={() => setSelectedSale(null)}
          onView={() => {
            setDetailsSale(selectedSale);
            setSelectedSale(null);
          }}
          viewLabel="Ver detalles"
          onEdit={
            (selectedSale.status === "PENDIENTE" || selectedSale.status === "PENDIENTE DE CIERRE")
              ? () => {
                  setEditingSale(selectedSale);
                  setSelectedSale(null);
                }
              : undefined
          }
          editLabel="Editar"
          onDelete={
            (selectedSale.status === "PENDIENTE" || selectedSale.status === "PENDIENTE DE CIERRE")
              ? () => handleCancelSale(selectedSale)
              : undefined
          }
          deleteLabel="Anular"
        />
      ) : (
        <AppHeader title="Ventas" showBack />
      )}

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
            selectedId={selectedSale?.id}
            onSelect={(sale) => setSelectedSale(prev => prev?.id === sale.id ? null : sale)}
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
        onCancel={handleCancelSale}
        onEdit={(sale) => {
          setEditingSale(sale);
          setDetailsSale(null);
        }}
        confirming={confirmingSaleId === detailsSale?.id}
      />

      <SaleEditModal
        open={!!editingSale}
        sale={editingSale}
        onClose={() => setEditingSale(null)}
        onSave={handleSaveEditedSale}
      />
    </div>
  );
}
