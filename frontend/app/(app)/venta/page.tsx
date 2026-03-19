"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Filter } from "lucide-react";
import toast from "react-hot-toast";

import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesSearchBar from "@/src/components/sales/SalesSearchBar";
import SalesFilterModal, { type FilterStatus } from "@/src/components/sales/SalesFilterModal";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";

import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import { confirmSale, listSales, cancelSale, deleteSale, updateSale, createSale, type ApiOrder } from "@/src/services/sales";
import { invalidateCache } from "@/src/lib/cache";
import SaleEditModal from "@/src/components/sales/SaleEditModal";
import SaleCreateModal from "@/src/components/sales/SaleCreateModal";
import { Plus } from "lucide-react";

function mapOrderToSale(order: ApiOrder): Sale {
  return {
    id: order.id,
    sourceType: order.sourceType, // ORIGEN EXPLÍCITO
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    paymentMethod: order.paymentMethod,
    type: order.type,
    status: order.status as any, // Matches UnifiedStatus
    origin: order.origin,
    createdAt: order.createdAt,
    scheduledAt: order.scheduledAt,
    items: order.items.map((it) => ({
      itemId: it.itemId,
      qty: it.qty,
      name: it.name,
      price: it.price,
      durationMin: it.durationMin,
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
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDone = useRef(false);
  const [pendingSmoothScroll, setPendingSmoothScroll] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({
      block: "end",
      behavior,
    });
  }, []);

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
    let result = sales;

    if (filterStatus !== "ALL") {
      result = result.filter((s) => {
        if (filterStatus === "PENDING") {
          return s.status === "PENDIENTE" || s.status === "PENDIENTE DE CIERRE";
        }
        if (filterStatus === "CLOSED") {
          return s.status === "CERRADO";
        }
        if (filterStatus === "CANCELLED") {
          return s.status === "CANCELADO";
        }
        return true;
      });
    }

    const term = q.trim().toLowerCase();
    if (!term) return result;

    return result.filter((s) => {
      if (s.customerName.toLowerCase().includes(term)) return true;
      return s.items.some((i) => i.name.toLowerCase().includes(term));
    });
  }, [q, sales, filterStatus]);

  useEffect(() => {
    if (!loading && sales.length > 0 && !initialScrollDone.current) {
      setTimeout(() => scrollToBottom(), 100);
      initialScrollDone.current = true;
    }
  }, [loading, sales.length, scrollToBottom]);

  useEffect(() => {
    if (!pendingSmoothScroll) return;

    const frame = requestAnimationFrame(() => {
      scrollToBottom("smooth");
      setPendingSmoothScroll(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [sales.length, pendingSmoothScroll, scrollToBottom]);

  const businessName = typeof window !== "undefined" ? localStorage.getItem("businessName") || "Mi Negocio" : "Mi Negocio";

const handleSendWhatsApp = (sale: Sale) => {
  if (!sale.customerWhatsapp) {
    alert("El cliente no tiene número de WhatsApp");
    return;
  }

  const msg = formatSaleMessage({
    businessName,
    customerName: sale.customerName,
    type: sale.type,
    scheduledAt: sale.scheduledAt,
    items: sale.items,
  });

  const url = buildWhatsAppUrl(sale.customerWhatsapp, msg);

  window.open(url, "_blank");
};

  const handleConfirmSale = useCallback(async (sale: Sale) => {
  showConfirmation(
    "¿Deseás confirmar esta venta?",
    "Confirmar",
    async () => {
      const loadingId = "sale-confirm-loading";
      const successId = "sale-confirm-success";
      const errorId = "sale-confirm-error";

      try {
        setConfirmingSaleId(sale.id);
        setError(null);

        toast.dismiss(loadingId);
        toast.dismiss(successId);
        toast.dismiss(errorId);

        toast.loading("Confirmando venta...", { id: loadingId });

        await confirmSale(sale.id, sale.sourceType);

        invalidateCache("home:sales");
        await loadOrders();

        setDetailsSale(null);

        toast.dismiss(loadingId);

        toast.success("Venta confirmada", {
          id: successId,
          duration: 2000,
        });

        setTimeout(() => {
          toast.dismiss(successId);
        }, 2100);
      } catch (err) {
        console.error(err);
        setError("No se pudo finalizar la venta");
        await loadOrders();

        toast.dismiss(loadingId);

        toast.error("Error al confirmar venta", {
          id: errorId,
          duration: 3000,
        });

        setTimeout(() => {
          toast.dismiss(errorId);
        }, 3100);
      } finally {
        setConfirmingSaleId(null);
      }
    },
    "emerald"
  );
 }, [loadOrders]);

 const handleCreateSale = async (data: {
    customerName: string;
    customerWhatsapp: string;
    type: Sale["type"];
    status: "PENDIENTE" | "CERRADO";
    paymentMethod: "CASH" | "BANK_TRANSFER";
    items: { itemId: string; quantity: number }[];
  }) => {
    try {
      const created = await createSale({
        ...data,
        origin: "MANUAL",
      });

      if (data.status === "CERRADO") {
        await confirmSale(created.id, created.sourceType);
      }

      toast.success("Venta regitrada manualmente");
      invalidateCache("home:sales");
      invalidateCache("home:businessActivity");
      await loadOrders();
      setIsCreateOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Error al registrar la venta");
    }
  };

 const handleDeleteSale = useCallback(async (sale: Sale) => {
  showConfirmation(
    "¿Deseás eliminar esta venta?",
    "Eliminar",
    async () => {
      const loadingId = "sale-delete-loading";
      const successId = "sale-delete-success";
      const errorId = "sale-delete-error";

      try {
        setConfirmingSaleId(sale.id);
        setError(null);

        toast.dismiss(loadingId);
        toast.dismiss(successId);
        toast.dismiss(errorId);

        toast.loading("Eliminando venta...", { id: loadingId });

        await deleteSale(sale.id, sale.sourceType);

        invalidateCache("home:sales");
        invalidateCache("home:businessActivity");

        await loadOrders();

        if (detailsSale?.id === sale.id) setDetailsSale(null);
        setSelectedSale(null);

        toast.dismiss(loadingId);

        toast.success("Venta eliminada", {
          id: successId,
          duration: 2000,
        });

        setTimeout(() => {
          toast.dismiss(successId);
        }, 2100);
      } catch (err) {
        console.error(err);
        setError("No se pudo eliminar la venta");

        toast.dismiss(loadingId);

        toast.error("Error al eliminar venta", {
          id: errorId,
          duration: 3000,
        });

        setTimeout(() => {
          toast.dismiss(errorId);
        }, 3100);
      } finally {
        setConfirmingSaleId(null);
      }
    },
    "rose"
  );
}, [detailsSale, loadOrders]);

  const handleSaveEditedSale = async (updated: Sale) => {
  const loadingId = "sale-edit-loading";
  const successId = "sale-edit-success";
  const errorId = "sale-edit-error";

  try {
    setConfirmingSaleId(updated.id);
    setError(null);

    toast.dismiss(loadingId);
    toast.dismiss(successId);
    toast.dismiss(errorId);

    toast.loading("Guardando cambios...", { id: loadingId });

    const dto = {
      customerName: updated.customerName,
      customerWhatsapp: updated.customerWhatsapp,
      paymentMethod: updated.paymentMethod,
      scheduledAt: updated.scheduledAt,
      items: updated.items
        .filter((it) => it.itemId)
        .map((it) => ({
          itemId: it.itemId!,
          quantity: it.qty,
        })),
    };

    await updateSale(updated.id, dto, updated.sourceType);

    invalidateCache("home:sales");
    await loadOrders();

    setEditingSale(null);
    if (detailsSale?.id === updated.id) {
      setDetailsSale(null);
    }

    toast.dismiss(loadingId);

    toast.success("Venta actualizada", {
      id: successId,
      duration: 2000,
    });

    setTimeout(() => {
      toast.dismiss(successId);
    }, 2100);
  } catch (err) {
    console.error(err);
    setError("No se pudo actualizar la venta");

    toast.dismiss(loadingId);

    toast.error("Error al actualizar la venta", {
      id: errorId,
      duration: 3000,
    });

    setTimeout(() => {
      toast.dismiss(errorId);
    }, 3100);
  } finally {
    setConfirmingSaleId(null);
  }
};

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F0F2F5]">
      <div className="shrink-0">
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
          onDelete={() => handleDeleteSale(selectedSale)}
          deleteLabel="Eliminar"
        />
      ) : (
        <AppHeader 
          title="Ventas" 
          showBack 
          rightIcon={<Filter size={20} />}
          onRightClick={() => setFilterOpen(true)}
          rightAriaLabel="Filtrar estado"
        />
      )}
      </div>

      <main className="min-h-0 flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto w-full pb-24">
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

          {!loading && !error && filtered.length === 0 && (
            <div className="p-6 flex flex-col items-center justify-center text-center text-neutral-400 mt-10 h-32">
              No hay ventas {filterStatus !== "ALL" ? "con este estado" : "todavía"}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <SalesList
              sales={filtered}
              selectedId={selectedSale?.id}
              onSelect={(sale) => setSelectedSale(prev => prev?.id === sale.id ? null : sale)}
              onDetails={(sale) => setDetailsSale(sale)}
              onSendWhatsApp={handleSendWhatsApp}
            />
          )}
          <div ref={bottomRef} className="h-px w-full" />
        </div>
      </main>

      <div className="shrink-0">
        <SalesSearchBar value={q} onChange={setQ} onAction={() => {}} />
      </div>

      <SalesFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        status={filterStatus}
        onChange={setFilterStatus}
      />

      <SaleDetailsModal
        open={!!detailsSale}
        sale={detailsSale}
        onClose={() => setDetailsSale(null)}
        onConfirm={handleConfirmSale}
        onCancel={handleDeleteSale}
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

      <button
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-[84px] left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 shadow-[0_8px_30px_rgba(5,150,105,0.3)] text-white hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <SaleCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreateSale}
      />
    </div>
  );
}
