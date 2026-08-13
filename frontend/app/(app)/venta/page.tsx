"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, ShoppingBag, LineChart, ClipboardCheck, Plus, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";

import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import { EmptyStateCard } from "@/src/components/shared/EmptyStateCard";
import SalesList from "@/src/components/sales/SalesList";
import SalesChatComposer from "@/src/components/sales/SalesChatComposer";
import SalesFilterModal, { type FilterStatus } from "@/src/components/sales/SalesFilterModal";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";
import SaleReceiptModal from "@/src/components/sales/SaleReceiptModal";

import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";
import { confirmSale, listSales, getSale, deleteSale, updateSale, createSale, updateOrderItemOptionalIngredients, type ApiOrder } from "@/src/services/sales";
import { invalidateCache } from "@/src/lib/cache";
import { getErrorMessage } from "@/src/lib/errors";
import { AppApiError } from "@/src/lib/api";

import type { BuyerFiscalContext } from "@/src/lib/tax/api";
import { getBusinessDayKey } from "@/src/lib/businessDate";
import DayPickerCalendar, { isSameCalendarDay } from "@/src/components/shared/DayPickerCalendar";
import { useTaxSettings } from "@/src/hooks/useTaxSettings";
import { useFeatureFlags } from "@/src/hooks/useFeatureFlags";
import { getTaxProfile } from "@/src/lib/settings/api";

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

  const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setNavYear(selectedYear); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition"
      >
        <CalendarDays className="h-3.5 w-3.5 text-[#0B3F64]" />
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
                  className={`rounded-xl py-1.5 text-xs font-medium transition ${isSelected
                    ? "bg-[#0B3F64] text-white shadow-sm"
                    : "border border-neutral-100 bg-white text-slate-700 hover:bg-neutral-50"
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
  const fiscalContext = order.fiscalContext
    ? {
      ...order.fiscalContext,
      buyerIsRegimenSimple: Boolean(order.fiscalContext.buyerIsRegimenSimple),
    }
    : null;

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
    fiscalContext,
    taxLines: order.taxLines ?? null,
    total,
    items,
  };
}

function isDeletionBlockedByPostedInventory(sale: Sale) {
  return sale.status === "CERRADO" && sale.inventoryPostedAt != null;
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

function VentaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledDeepLinkRef = useRef<string | null>(null);
  const deepLinkRequestRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const saleElementsRef = useRef(new Map<string, HTMLDivElement>());
  const { taxSettingsEnabled } = useTaxSettings();
  const { simpleRegimeSalesEnabled } = useFeatureFlags();
  const [hasHistoricalSimpleResponsibility, setHasHistoricalSimpleResponsibility] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    getTaxProfile()
      .then((profile) => {
        setHasHistoricalSimpleResponsibility(
          Boolean(profile?.responsibilities?.some((item: any) => item.responsibility.code === "47")),
        );
      })
      .catch(() => setHasHistoricalSimpleResponsibility(false));
  }, []);

  const salesBlockedBySimpleRegime =
    !simpleRegimeSalesEnabled && hasHistoricalSimpleResponsibility;

  // ── Lazy initializers para consistencia con el Dashboard ──────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [filterYear, setFilterYear] = useState<number>(() => new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<"MONTH" | "DAILY">("DAILY");

  // today como referencia estable (sin useMemo para evitar desajustes)
  const todayRef = useRef(new Date());
  const today = todayRef.current;

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSaleId, setConfirmingSaleId] = useState<string | null>(null);
  const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [pendingDeepLinkSaleId, setPendingDeepLinkSaleId] = useState<
    string | null
  >(null);
  const [highlightedSaleId, setHighlightedSaleId] = useState<string | null>(
    null,
  );

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

  useEffect(() => {
    const saleId = searchParams.get("saleId");
    if (!saleId) {
      handledDeepLinkRef.current = null;
      return;
    }
    if (loading || handledDeepLinkRef.current === saleId) return;
    handledDeepLinkRef.current = saleId;
    const requestId = ++deepLinkRequestRef.current;

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedSaleId(null);
    setPendingDeepLinkSaleId(null);
    setDetailsSale(null);

    void getSale(saleId)
      .then((order) => {
        if (deepLinkRequestRef.current !== requestId) return;
        const sale = mapOrderToSale(order);
        const createdAt = new Date(sale.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
          throw new Error("INVALID_SALE_DATE");
        }
        setSales((current) =>
          current.some((item) => item.id === sale.id)
            ? current
            : [sale, ...current],
        );
        setQ("");
        setFilterStatus("ALL");
        setSelectedDate(createdAt);
        setFilterYear(createdAt.getFullYear());
        setFilterMonth(createdAt.getMonth() + 1);
        setViewMode("DAILY");
        setPendingDeepLinkSaleId(sale.id);
      })
      .catch(() => {
        if (deepLinkRequestRef.current !== requestId) return;
        setPendingDeepLinkSaleId(null);
        setHighlightedSaleId(null);
        setDetailsSale(null);
        toast("No se pudo abrir la venta solicitada.");
      })
      .finally(() => {
        if (deepLinkRequestRef.current !== requestId) return;
        const next = new URLSearchParams(searchParams.toString());
        next.delete("saleId");
        router.replace(next.toString() ? `/venta?${next}` : "/venta", {
          scroll: false,
        });
      });
  }, [loading, router, searchParams]);

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

  const registerSaleElement = useCallback(
    (saleId: string, element: HTMLDivElement | null) => {
      if (element) saleElementsRef.current.set(saleId, element);
      else saleElementsRef.current.delete(saleId);
    },
    [],
  );

  useEffect(() => {
    if (!pendingDeepLinkSaleId || loading) return;
    const sale = filtered.find((item) => item.id === pendingDeepLinkSaleId);
    const element = saleElementsRef.current.get(pendingDeepLinkSaleId);
    if (!sale || !element) return;

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    setDetailsSale(sale);
    setHighlightedSaleId(sale.id);

    const frame = requestAnimationFrame(() => {
      const bounds = element.getBoundingClientRect();
      const outsideViewport =
        bounds.top < 0 ||
        bounds.bottom >
        (window.innerHeight || document.documentElement.clientHeight);
      if (!outsideViewport) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      element.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedSaleId((current) =>
        current === sale.id ? null : current,
      );
      setPendingDeepLinkSaleId((current) =>
        current === sale.id ? null : current,
      );
      highlightTimerRef.current = null;
    }, 3_000);

    return () => cancelAnimationFrame(frame);
  }, [filtered, loading, pendingDeepLinkSaleId]);

  useEffect(
    () => () => {
      deepLinkRequestRef.current += 1;
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

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

      const buyerFiscalContext = sale.fiscalContext
        ? {
          ...sale.fiscalContext,
          buyerIsRegimenSimple: simpleRegimeSalesEnabled
            ? Boolean(sale.fiscalContext.buyerIsRegimenSimple)
            : false,
        }
        : undefined;

      await confirmSale(
        sale.id,
        sale.sourceType,
        buyerFiscalContext as BuyerFiscalContext | undefined,
      );

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
  }, [loadOrders, simpleRegimeSalesEnabled, taxSettingsEnabled]);

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
    if (isDeletionBlockedByPostedInventory(sale)) {
      toast.error("Esta venta ya fue confirmada e impactó inventario. No puede eliminarse.");
      return;
    }

    showConfirmation(
      "¿Deseás eliminar esta venta?",
      "Eliminar",
      async () => {
        const loadingId = "sale-delete-loading";
        const successId = "sale-delete-success";
        const errorId = "sale-delete-error";

        try {
          setConfirmingSaleId(sale.id);

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

          toast.dismiss(loadingId);

          const isPostedInventoryDeletionError =
            err instanceof AppApiError &&
            err.status === 400 &&
            err.message.toLowerCase().includes("inventario impactado");
          const message = isPostedInventoryDeletionError
            ? "Esta venta ya fue confirmada e impactó inventario. No puede eliminarse."
            : getErrorMessage(err, "No se pudo eliminar la venta");

          toast.error(message, {
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
        ...(updated.scheduledAt ? { scheduledAt: updated.scheduledAt } : {}),
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
              !salesBlockedBySimpleRegime &&
                (selectedSale.status === "PENDIENTE" || selectedSale.status === "PENDIENTE DE CIERRE")
                ? () => {
                  setEditingSale(selectedSale);
                  setSelectedSale(null);
                }
                : undefined
            }
            editLabel="Editar"
            onDelete={
              salesBlockedBySimpleRegime || isDeletionBlockedByPostedInventory(selectedSale)
                ? undefined
                : () => handleDeleteSale(selectedSale)
            }
            deleteLabel="Eliminar"
          />
        ) : (
          <AppHeader
            title="Ventas"
            showBack
            rightContent={
              <div className="flex items-center gap-2">
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
      {salesBlockedBySimpleRegime && (
        <div className="mx-4 mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-600">
          Tu perfil fiscal conserva la responsabilidad 47 — Régimen Simple. Este régimen no está disponible en esta versión y las ventas nuevas están bloqueadas para este perfil. La responsabilidad debe ser corregida mediante un proceso administrativo controlado o el módulo debe habilitarse nuevamente.
        </div>
      )}

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
                <div
                  className="relative overflow-hidden p-5 rounded-[24px] flex flex-col items-start shadow-sm text-white"
                  style={{
                    background: "#121A28",
                    backgroundImage: "linear-gradient(135deg, rgba(18, 26, 40, 1) 0%, rgba(106, 14, 47, 1) 50%, rgba(200, 2, 55, 1) 100%)"
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
                  <div className="relative z-10 flex flex-col items-start w-full">
                    <div className="p-2.5 bg-white/10 rounded-xl mb-4 border border-white/10">
                      <LineChart className="h-5 w-5" color="#ffffff" strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider mb-2">
                      Total ventas
                    </span>
                    <span className="text-xl font-normal text-white tabular-nums">
                      ${formatDisplayMoney(todayMetrics.total)}
                    </span>
                  </div>
                </div>

                <div
                  className="relative overflow-hidden p-5 rounded-[24px] flex flex-col items-start shadow-sm text-white"
                  style={{
                    background: "#121A28",
                    backgroundImage: "linear-gradient(135deg, rgba(18, 26, 40, 1) 0%, rgba(106, 14, 47, 1) 50%, rgba(200, 2, 55, 1) 100%)"
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:18px_18px] opacity-35" />
                  <div className="relative z-10 flex flex-col items-start w-full">
                    <div className="p-2.5 bg-white/10 rounded-xl mb-4 border border-white/10">
                      <ClipboardCheck className="h-5 w-5" color="#ffffff" strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider mb-2">
                      Transacciones
                    </span>
                    <span className="text-xl font-normal text-white">
                      {todayMetrics.transactions} realizadas
                    </span>
                  </div>
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
                      className="rounded-full bg-[#E6EFF5] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0B3F64] hover:bg-[#E6EFF5]/80 transition-colors shadow-sm"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="mx-auto w-full max-w-md px-3 py-4 sm:max-w-3xl sm:px-4">
              <EmptyStateCard
                icon={ShoppingBag}
                title={filterStatus !== "ALL" ? "Sin ventas en este estado" : "Aún no hay ventas"}
                description={
                  filterStatus !== "ALL"
                    ? "No se encontraron ventas registradas con el filtro seleccionado."
                    : "Registrá tu primera venta enviando los productos desde la barra de chat."
                }
                actionLabel={filterStatus === "ALL" ? "Nueva venta" : undefined}
                actionIcon={Plus}
                onAction={filterStatus === "ALL" && !salesBlockedBySimpleRegime ? () => setIsCreateOpen(true) : undefined}
              />
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <SalesList
              sales={filtered}
              selectedId={selectedSale?.id}
              highlightedId={highlightedSaleId}
              targetId={pendingDeepLinkSaleId}
              onSaleElement={registerSaleElement}
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

      {editingSale && !salesBlockedBySimpleRegime && (
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
        onConfirm={salesBlockedBySimpleRegime ? undefined : handleConfirmSale}
        onSaveOptionalIngredients={salesBlockedBySimpleRegime ? undefined : handleSaveOptionalIngredients}
        onCancel={
          salesBlockedBySimpleRegime ||
          (detailsSale != null && isDeletionBlockedByPostedInventory(detailsSale))
            ? undefined
            : handleDeleteSale
        }
        onEdit={salesBlockedBySimpleRegime ? undefined : (sale) => {
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

      {!editingSale && (
        <SalesChatComposer
          expanded={salesBlockedBySimpleRegime ? false : isCreateOpen}
          onOpenComposer={() => {
            if (!salesBlockedBySimpleRegime) setIsCreateOpen(true);
          }}
          onCancelComposer={() => setIsCreateOpen(false)}
          searchValue={q}
          onSearchChange={setQ}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          onSave={salesBlockedBySimpleRegime ? async () => undefined : handleCreateSale}
          taxSettingsEnabled={taxSettingsEnabled}
        />
      )}
    </div>
  );
}

export default function VentaPage() {
  return (
    <Suspense fallback={null}>
      <VentaPageContent />
    </Suspense>
  );
}
