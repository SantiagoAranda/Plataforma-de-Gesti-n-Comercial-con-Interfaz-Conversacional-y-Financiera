"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { MovementEmptyState } from "@/src/components/movements/MovementEmptyState";
import { MovementProfitHero } from "@/src/components/movements/MovementProfitHero";
import { MovementSummaryList } from "@/src/components/movements/MovementSummaryList";
import { getAccountingSummary, type AccountingSummary } from "@/src/services/accounting";
import { cn } from "@/src/lib/utils";
import DayPickerCalendar from "@/src/components/shared/DayPickerCalendar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ViewMode = "MONTH" | "DAILY";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function formatLocalISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

function isTodayLocal(d: Date): boolean {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function formatCop(value: number) {
  return Math.round(Number(value || 0)).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatRate(value: number) {
  return `${(Number(value || 0) * 100).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  })}%`;
}

// ─── Componente: MonthPickerPopover (clonado de Nómina / HeaderCalendar) ──── ─

function MonthPickerPopover({
  selectedYear,
  selectedMonth,
  onSelect,
}: {
  selectedYear: number;
  selectedMonth: number; // 1-indexed
  onSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedYear);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
      >
        <CalendarDays className="h-4 w-4 text-slate-400" />
        <span>{MONTH_NAMES[selectedMonth - 1].substring(0, 3)} {selectedYear}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          {/* Navegador de año */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1 text-neutral-500 hover:text-neutral-900 transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold text-neutral-800">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1 text-neutral-500 hover:text-neutral-900 transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Grid de meses */}
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, i) => {
              const month = i + 1;
              const isSelected = selectedYear === viewYear && selectedMonth === month;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => {
                    onSelect(viewYear, month);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-xl py-2 text-[13px] font-medium transition-colors",
                    isSelected
                      ? "bg-emerald-500 text-white"
                      : "border border-neutral-100 bg-white text-slate-700 hover:bg-neutral-50"
                  )}
                >
                  {name.substring(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MovimientosPage() {
  // Modo de vista: MONTH (mes completo) | DAILY (día individual)
  // Arranca en MONTH para que el primer fetch cargue el mes actual completo
  const [viewMode, setViewMode] = useState<ViewMode>("MONTH");

  // Estado del filtro mensual — inicializado con el mes en curso de forma lazy
  // (lazy initializer: se ejecuta sincrónicamente en el primer render, no después)
  const [filterYear, setFilterYear] = useState<number>(() => new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-indexed

  // Estado del filtro diario — también lazy para consistencia
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Datos
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Rango de fechas para la API ────────────────────────────────────────────
  // dateRange se recalcula solo cuando cambian los deps → sin renders infinitos
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    if (viewMode === "MONTH") {
      // Primer y último día del mes seleccionado, en hora local
      start = new Date(filterYear, filterMonth - 1, 1, 0, 0, 0, 0);
      end = new Date(filterYear, filterMonth, 0, 23, 59, 59, 999);
    } else {
      // Día individual completo, en hora local
      start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
      end = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);
    }

    return {
      from: formatLocalISO(start),
      to: formatLocalISO(end),
    };
  }, [viewMode, filterYear, filterMonth, selectedDate]);


  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setError(null);
        const data = await getAccountingSummary({
          from: dateRange.from,
          to: dateRange.to,
        });
        setSummary(data);
      } catch (e: unknown) {
        setSummary(null);
        const message =
          e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
            ? (e as { message: string }).message
            : "No se pudieron cargar los movimientos";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateRange]);

  // ── hasData ───────────────────────────────────────────────────────────────
  const hasData = useMemo(() => {
    if (!summary) return false;
    const op = summary.operacionComercial;
    const ga = summary.gastosAdministrativos;
    const ir = summary.impuestosReservas;
    return (
      op.ventasNetas !== 0 ||
      op.costosMercancia !== 0 ||
      op.utilidadBruta !== 0 ||
      op.devoluciones !== 0 ||
      ga.nominaSueldos !== 0 ||
      ga.insumosOperativos !== 0 ||
      ga.serviciosFijos !== 0 ||
      ir.iva !== 0 ||
      ir.retenciones !== 0 ||
      ir.fondosReserva !== 0
    );
  }, [summary]);

  // ── Badge LIMPIAR: visible cuando el filtro no es "hoy en modo diario" ────
  const showClearBadge = useMemo(() => {
    if (viewMode === "MONTH") return true; // siempre visible en modo mes
    return !isTodayLocal(selectedDate);   // en modo diario, solo si no es hoy
  }, [viewMode, selectedDate]);

  // ── Handler del selector de mes (clonado de Nómina) ──────────────────────
  const handleMonthSelect = (year: number, month: number) => {
    setFilterYear(year);
    setFilterMonth(month);
    setViewMode("MONTH");
  };

  // ── Handler al usar las flechas del DayPickerCalendar → modo DAILY ────────
  const handleDaySelect = (date: Date) => {
    setSelectedDate(date);
    setViewMode("DAILY");
  };

  // ── Reset: vuelve a hoy en modo diario ────────────────────────────────────
  const handleClear = () => {
    const today = new Date();
    setSelectedDate(today);
    setViewMode("DAILY");
  };

  // ── Label descriptivo del filtro activo ──────────────────────────────────
  const filterLabel = useMemo(() => {
    if (viewMode === "MONTH") {
      return `${MONTH_NAMES[filterMonth - 1]} ${filterYear}`;
    }
    return null;
  }, [viewMode, filterMonth, filterYear]);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader
        title="Dashboard"
        subtitle="Resumen del negocio"
        showBack={false}
        showLogout={false}
        rightContent={
          <MonthPickerPopover
            selectedYear={filterYear}
            selectedMonth={filterMonth}
            onSelect={handleMonthSelect}
          />
        }
      />

      <main className="mx-auto w-full max-w-4xl space-y-5 px-3 pb-28 pt-3 sm:px-4">
        {loading && (
          <div className="rounded-2xl bg-white p-4 text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
            Cargando dashboard...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-white p-4 text-sm text-red-600 shadow-sm ring-1 ring-black/5">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {summary && <MovementProfitHero metrics={summary} />}

            {summary?.simpleTaxProjection?.enabled && (
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                      Régimen Simple
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-slate-900">
                      {summary.simpleTaxProjection.configured
                        ? summary.simpleTaxProjection.source === "POSTED_ACTUAL"
                          ? summary.simpleTaxProjection.periodStatus === "PAID"
                            ? "Periodo pagado"
                            : "Periodo cerrado"
                          : "Estimación mensual"
                        : "Configuración pendiente"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {summary.simpleTaxProjection.message ??
                        "No genera asiento contable hasta presentar el bimestre."}
                    </p>
                  </div>
                  <Link
                    href="/contabilidad/regimen-simple"
                    className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Ver detalle
                  </Link>
                </div>

                {summary.simpleTaxProjection.configured ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Bimestre
                      </p>
                      <p className="font-medium text-slate-700">
                        {summary.simpleTaxProjection.periodNumber} / {summary.simpleTaxProjection.taxYear}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Base RST
                      </p>
                      <p className="font-medium text-slate-700">
                        {formatCop(summary.simpleTaxProjection.grossIncomeBase)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Tarifa
                      </p>
                      <p className="font-medium text-slate-700">
                        {formatRate(summary.simpleTaxProjection.estimatedRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {summary.simpleTaxProjection.source === "POSTED_ACTUAL"
                          ? summary.simpleTaxProjection.periodStatus === "PAID"
                            ? "Impuesto pagado"
                            : "Impuesto cerrado"
                          : "Impuesto estimado"}
                      </p>
                      <p className="font-semibold text-slate-900">
                        {formatCop(summary.simpleTaxProjection.estimatedSimpleTax)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Antes RST
                      </p>
                      <p className="font-medium text-slate-700">
                        {formatCop(summary.simpleTaxProjection.netProfitBeforeSimpleTax)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {summary.simpleTaxProjection.source === "POSTED_ACTUAL"
                          ? "Utilidad contable"
                          : "Después RST"}
                      </p>
                      <p className="font-semibold text-emerald-700">
                        {formatCop(summary.simpleTaxProjection.netProfitAfterSimpleTax)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Barra de filtro de fecha unificada ── */}
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-all duration-300">

              {/* Selector de día — limpio y simétrico con solo flechas + fecha */}
              <DayPickerCalendar
                selectedDate={selectedDate}
                onSelectDate={handleDaySelect}
                markedDateKeys={new Set<string>()}
                id="movements-calendar"
              />

              {/* Badge LIMPIAR — clonado de Ventas */}
              {showClearBadge && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 transition-all"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>

            {/* ── Contenido ── */}
            {hasData && summary ? (
              <section className="space-y-5">
                <MovementSummaryList metrics={summary} />
              </section>
            ) : (
              <MovementEmptyState />
            )}
          </>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}
