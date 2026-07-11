"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Filter, ShoppingBag, WalletCards } from "lucide-react";
import toast from "react-hot-toast";

import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesChatComposer from "@/src/components/sales/SalesChatComposer";
import SalesFilterModal, { type FilterStatus } from "@/src/components/sales/SalesFilterModal";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";
import SaleReceiptModal from "@/src/components/sales/SaleReceiptModal";

import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import { confirmSale, listSales, deleteSale, updateSale, createSale, updateOrderItemOptionalIngredients, type ApiOrder } from "@/src/services/sales";
import { invalidateCache } from "@/src/lib/cache";
import { getErrorMessage } from "@/src/lib/errors";

import type { BuyerFiscalContext } from "@/src/lib/tax/api";
import { getBusinessDayKey } from "@/src/lib/businessDate";
import DayPickerCalendar, { isSameCalendarDay } from "@/src/components/shared/DayPickerCalendar";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";

// ─── MonthPickerPopover (inline, cloned from Dashboard / Nómina) ───────────
function MonthPickerPopover({
  selectedYear,
  selectedMonth,
  onSelect,
}: {
  selectedYear: number;
  selectedMonth: number;
  onSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(selectedYear);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setNavYear(selectedYear); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition"
      >
        <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
        {MONTHS[selectedMonth - 1]} {selectedYear}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          {/* Navegador de año */}
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setNavYear((y) => y - 1)} className="rounded-lg p-1 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4 text-slate-500" />
            </button>
            <span className="text-sm font-semibold text-slate-800">{navYear}</span>
            <button onClick={() => setNavYear((y) => y + 1)} className="rounded-lg p-1 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          {/* Grilla de meses 3x4 */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const isSelected = navYear === selectedYear && i + 1 === selectedMonth;
              return (
                <button
                  key={m}
                  onClick={() => { onSelect(navYear, i + 1); setOpen(false); }}
                  className={`rounded-xl py-1.5 text-xs font-medium transition ${
                    isSelected
                      ? "bg-slate-800 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function mapOrderToSale(order: ApiOrder): Sale {
  console.log(`[mapOrderToSale] order id:${order.id} origin:${order.origin}`);

  const items = order.items.map((it) => {
    const unitPrice = it.unitPrice ?? it.price;

    return {
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      qty: it.qty,
      name: it.name,
      unitPrice,
      price: it.price ?? unitPrice * it.qty,
      durationMin: it.durationMin,
      itemInventoryMode: it.itemInventoryMode,
      excludedOptionalIngredientIds: it.excludedOptionalIngredientIds ?? [],
      optionSelections: (it.options ?? [])
        .filter((option) => option.groupId && option.optionId && option.action)
        .map((option) => ({
          groupId: option.groupId!,
          optionId: option.optionId!,
          action: option.action!,
        })),
      options: it.options ?? [],
      recipe: it.recipe ?? [],
    };
  });

  const total =
    order.total ??
    items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);

  return {
    id: order.id,
    sourceType: order.sourceType,
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    paymentMethod: order.paymentMethod,
    type: order.type,
    status: order.status as Sale["status"],
    inventoryPostedAt: order.inventoryPostedAt ?? null,
    accountingPostedAt: order.accountingPostedAt ?? null,
    origin: order.origin,
    createdAt: order.createdAt,
    scheduledAt: order.scheduledAt,
    fiscalSummary: order.fiscalSummary ?? null,
    fiscalContext: order.fiscalContext ?? null,
    taxLines: order.taxLines ?? null,
    total,
    items,
  };
}

function formatDisplayMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function getCalendarBusinessDayKey(date: Date) {
  return getBusinessDayKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12),
  );
}

export default function VentaPage() {
  const { taxSettingsEnabled } = useTaxSettings();
  const [q, setQ] = useState("");

  // ── Lazy initializers para consistencia con el Dashboard ──────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [filterYear, setFilterYear]     = useState<number>(() => new Date().getFullYear());
  const [filterMonth, setFilterMonth]   = useState<number>(() => new Date().getMonth() + 1);
  const [viewMode, setViewMode]         = useState<"MONTH" | "DAILY">("DAILY");

  // today como referencia estable (sin useMemo para evitar desajustes)
  const todayRef = useRef(new Date());
  const today    = todayRef.current;

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSaleId, setConfirmingSaleId] = useState<string | null>(null);
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
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
            <p className="text-[13px] font-medium text-neutral-800 leading-tight mb-3">{title}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toast.dismiss(t.id)}
                className="flex-1 h-9 rounded-xl bg-neutral-50 text-neutral-500 text-[11px] font-medium uppercase tracking-wider hover:bg-neutral-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  onAction();
                }}
                className={`flex-1 h-9 rounded-xl text-white text-[11px] font-medium uppercase tracking-wider shadow-sm transition ${variant === 'rose' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
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

  // ── Ventas del período activo (MONTH o DAILY) ────────────────────────────
  const salesForPeriod = useMemo(() => {
    if (viewMode === "MONTH") {
      // Filtro client-side por año/mes de createdAt
      return sales.filter((sale) => {
        try {
          const d = new Date(sale.createdAt);
          return d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth;
        } catch {
          return false;
        }
      });
    }
    // Modo DAILY: filtro por día de negocio (comportamiento original)
    const selectedKey = getCalendarBusinessDayKey(selectedDate);
    return sales.filter((sale) => {
      try {
        return getBusinessDayKey(sale.createdAt) === selectedKey;
      } catch {
        return false;
      }
    });
  }, [sales, viewMode, filterYear, filterMonth, selectedDate]);

  // Alias para compatibilidad con el DayPickerCalendar (marcado de fechas)
  const salesForSelectedDate = salesForPeriod;

  const filtered = useMemo(() => {
    let result = salesForSelectedDate;

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
      if (s.customerName?.toLowerCase().includes(term)) return true;
      if (s.id.toLowerCase().includes(term)) return true;
      return s.items.some((i) => i.name.toLowerCase().includes(term));
    });
  }, [q, salesForSelectedDate, filterStatus]);

  const todayMetrics = useMemo(() => {
    return {
      total: salesForSelectedDate
        .filter((sale) => sale.status === "CERRADO")
        .reduce((acc, sale) => acc + (sale.total ?? 0), 0),
      transactions: salesForSelectedDate.length,
    };
  }, [salesForSelectedDate]);

  const saleDateKeys = useMemo(() => {
    const keys = new Set<string>();
    sales.forEach((sale) => {
      try {
        keys.add(getBusinessDayKey(sale.createdAt));
      } catch { }
    });
    return keys;
  }, [sales]);

  // ── hasDateFilter: visible en modo DAILY con día != hoy, o en modo MONTH ───────
  const hasDateFilter = viewMode === "MONTH" || !isSameCalendarDay(selectedDate, today);

  // ── Handler del selector de mes → activa modo MONTH ────────────────────
  const handleMonthSelect = (year: number, month: number) => {
    setFilterYear(year);
    setFilterMonth(month);
    setViewMode("MONTH");
    // Actualiza selectedDate para sincronizar el calendario visual
    setSelectedDate(new Date(year, month - 1, 1));
  };

  // ── Handler de las flechas del DayPicker → activa modo DAILY ───────────
  const handleDaySelect = (date: Date) => {
    setSelectedDate(date);
    setViewMode("DAILY");
    // Sincroniza el estado del popover con el mes del día elegido
    setFilterYear(date.getFullYear());
    setFilterMonth(date.getMonth() + 1);
  };

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

    const baseMsg = formatSaleMessage({
      businessName,
      customerName: sale.customerName || "Cliente",
      type: sale.type,
      scheduledAt: sale.scheduledAt,
      items: sale.items,
    });

    const reservaLink =
      sale.type === "SERVICIO" && sale.id
        ? `\n\n📋 Consultá el detalle de tu turno aquí:\n${window.location.origin}/reserva/${sale.id}`
        : "";

    const msg = baseMsg + reservaLink;

    const url = buildWhatsAppUrl(sale.customerWhatsapp, msg);

    window.open(url, "_blank");
  };

  const handleConfirmSale = useCallback(async (sale: Sale) => {
    if (taxSettingsEnabled && !sale.fiscalContext) {
      toast.error("Faltan datos fiscales para liquidar esta venta. Editala antes de confirmar.");
      return;
    }

    const loadingId = "sale-confirm-loading";
    const successId = "sale-confirm-success";
    const errorId = "sale-confirm-error";

    try {
      setConfirmingSaleId(sale.id);
      setError(null);

      toast.dismiss(loadingId);
      toast.dismiss(successId);
      toast.dismiss(errorId);

      toast.loading("Confirmando venta e impuestos...", { id: loadingId });

      await confirmSale(sale.id, sale.sourceType, sale.fiscalContext as BuyerFiscalContext);

      invalidateCache("home:sales");
      await loadOrders();

      setDetailsSale(null);
      toast.dismiss(loadingId);
      toast.success("Venta confirmada con impuestos", {
        id: successId,
        duration: 2000,
      });
    } catch (err) {
      console.error(err);
      const message = getErrorMessage(err, "No se pudo finalizar la venta");
      setError(message);
      await loadOrders();

      toast.dismiss(loadingId);
      toast.error(message, {
        id: errorId,
        duration: 5000,
      });
    } finally {
      setConfirmingSaleId(null);
    }
  }, [loadOrders, taxSettingsEnabled]);

  const handleSaveOptionalIngredients = useCallback(
    async (sale: Sale, orderItemId: string, excludedOptionalIngredientIds: string[]) => {
      await updateOrderItemOptionalIngredients(
        sale.id,
        orderItemId,
        excludedOptionalIngredientIds,
      );

      setSales((current) =>
        current.map((currentSale) =>
          currentSale.id === sale.id && currentSale.sourceType === sale.sourceType
            ? {
              ...currentSale,
              items: currentSale.items.map((item) =>
                item.orderItemId === orderItemId
                  ? { ...item, excludedOptionalIngredientIds }
                  : item,
              ),
            }
            : currentSale,
        ),
      );
      setDetailsSale((currentSale) =>
        currentSale?.id === sale.id && currentSale.sourceType === sale.sourceType
          ? {
            ...currentSale,
            items: currentSale.items.map((item) =>
              item.orderItemId === orderItemId
                ? { ...item, excludedOptionalIngredientIds }
                : item,
            ),
          }
          : currentSale,
      );
      invalidateCache("home:sales");
      await loadOrders();
    },
    [loadOrders],
  );

  const handleCreateSale = async (data: {
    customerName?: string;
    customerWhatsapp?: string;
    type: Sale["type"];
    status: "PENDIENTE" | "CERRADO";
    paymentMethod: "CASH" | "BANK_TRANSFER";
    scheduledAt?: string;
    durationMinutes?: number;
    buyerFiscalContext?: BuyerFiscalContext;
    items: { itemId: string; quantity: number }[];
  }) => {
    try {
      const payload = {
        ...data,
        origin: "MANUAL" as const,
      };
      console.log("Payload create sale:", payload);
      const created = await createSale(payload);

      if (data.status === "CERRADO") {
        await confirmSale(created.id, created.sourceType, data.buyerFiscalContext);
      }

      toast.success("Venta registrada manualmente");
      invalidateCache("home:sales");
      invalidateCache("home:businessActivity");
      await loadOrders();
      setIsCreateOpen(false);
      setPendingSmoothScroll(true);
    } catch (error: unknown) {
      console.error("Error creating sale:", error);
      const apiError = error as {
        status?: unknown;
        details?: unknown;
        raw?: unknown;
        message?: string;
      };
      console.error("Status:", apiError.status);
      console.error("Details:", apiError.details);
      console.error("Raw:", apiError.raw);
      toast.error(apiError.message || "Error al registrar la venta");
      throw error;
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
        customerName: updated.customerName ?? undefined,
        customerWhatsapp: updated.customerWhatsapp ?? undefined,
        paymentMethod: updated.paymentMethod,
        scheduledAt: updated.scheduledAt,
        buyerFiscalContext: updated.fiscalContext ?? undefined,
        items: updated.items
          .filter((it) => it.itemId)
          .map((it) => ({
            itemId: it.itemId!,
            quantity: it.qty,
            optionSelections: it.optionSelections,
            excludedOptionalIngredientIds: it.excludedOptionalIngredientIds,
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
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white">
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
            rightContent={
              <div className="flex items-center gap-2">
                {/* Filtro de estados */}
                <button
                  onClick={() => setFilterOpen(true)}
                  aria-label="Filtrar estado"
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition"
                >
                  <Filter size={18} />
                </button>
                {/* Selector de mes */}
                <MonthPickerPopover
                  selectedYear={filterYear}
                  selectedMonth={filterMonth}
                  onSelect={handleMonthSelect}
                />
              </div>
            }
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

          {!loading && !error && (
            <section className="mx-auto w-full max-w-md px-3 pt-4 sm:max-w-3xl sm:px-4">
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start">
                  <div className="p-2 bg-emerald-50 rounded-lg mb-3">
                    <WalletCards className="h-4 w-4 text-emerald-500" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                    Total ventas
                  </span>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">
                    ${formatDisplayMoney(todayMetrics.total)}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-start">
                  <div className="p-2 bg-indigo-50 rounded-lg mb-3">
                    <ShoppingBag className="h-4 w-4 text-indigo-500" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
                    Transacciones
                  </span>
                  <span className="text-lg font-semibold text-slate-900">
                    {todayMetrics.transactions} realizadas
                  </span>
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
                <DayPickerCalendar
                  selectedDate={selectedDate}
                  onSelectDate={handleDaySelect}
                  markedDateKeys={saleDateKeys}
                  id="sales-calendar"
                />
                {hasDateFilter && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setSelectedDate(now);
                        setViewMode("DAILY");
                        setFilterYear(now.getFullYear());
                        setFilterMonth(now.getMonth() + 1);
                      }}
                      className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="p-6 flex flex-col items-center justify-center text-center text-neutral-400 h-32">
              No hay ventas {filterStatus !== "ALL" ? "con este estado" : "todavía"}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <SalesList
              sales={filtered}
              selectedId={selectedSale?.id}
              onSelect={(sale) => setSelectedSale(prev => prev?.id === sale.id ? null : sale)}
              onDetails={(sale) => setDetailsSale(sale)}
              onReceipt={(sale) => setReceiptSale(sale)}
              onSendWhatsApp={handleSendWhatsApp}
              taxSettingsEnabled={taxSettingsEnabled}
            />
          )}
          <div ref={bottomRef} className="h-px w-full" />
        </div>
      </main>

      {editingSale && (
        <SalesChatComposer
          mode="edit"
          sale={editingSale}
          expanded={true}
          onCancelComposer={() => setEditingSale(null)}
          onSave={handleSaveEditedSale}
          taxSettingsEnabled={taxSettingsEnabled}
        />
      )}






      <SaleDetailsModal
        open={!!detailsSale}
        sale={detailsSale}
        onClose={() => setDetailsSale(null)}
        onConfirm={handleConfirmSale}
        onSaveOptionalIngredients={handleSaveOptionalIngredients}
        onCancel={handleDeleteSale}
        onEdit={(sale) => {
          setEditingSale(sale);
          setDetailsSale(null);
        }}
        confirming={confirmingSaleId === detailsSale?.id}
        taxSettingsEnabled={taxSettingsEnabled}
      />

      <SaleReceiptModal
        open={!!receiptSale}
        sale={receiptSale}
        onClose={() => setReceiptSale(null)}
        taxSettingsEnabled={taxSettingsEnabled}
      />

      <SalesFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        status={filterStatus}
        onChange={setFilterStatus}
      />

      <SalesChatComposer
        expanded={isCreateOpen}
        onOpenComposer={() => setIsCreateOpen(true)}
        onCancelComposer={() => setIsCreateOpen(false)}
        searchValue={q}
        onSearchChange={setQ}
        onSave={handleCreateSale}
        taxSettingsEnabled={taxSettingsEnabled}
      />
    </div>
  );
}
