"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { MovementEmptyState } from "@/src/components/movements/MovementEmptyState";
import { MovementProfitHero } from "@/src/components/movements/MovementProfitHero";
import { MovementSummaryList } from "@/src/components/movements/MovementSummaryList";
import { getAccountingSummary, type AccountingSummary } from "@/src/services/accounting";
import { cn } from "@/src/lib/utils";
import DayPickerCalendar, { isSameCalendarDay } from "@/src/components/shared/DayPickerCalendar";

type MovementFilterMode = "custom-day" | "7days" | "month";

export default function MovimientosPage() {
  const [filterMode, setFilterMode] = useState<MovementFilterMode>("custom-day");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (filterMode === "custom-day") {
      start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
      end = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);
    } else if (filterMode === "7days") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      start = new Date(todayStart);
      start.setDate(todayStart.getDate() - 7);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else { // 'month'
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const formatLocalISO = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
    };

    return {
      from: formatLocalISO(start),
      to: formatLocalISO(end),
    };
  }, [filterMode, selectedDate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setError(null);
        const data = await getAccountingSummary({
          from: dateRange.from,
          to: dateRange.to,
        });
        console.log("🔍 AUDITORÍA DE PAYLOAD - MOVIMIENTOS REALES:", data);
        setSummary(data);
      } catch (e: unknown) {
        console.error(e);
        setSummary(null);
        const message = e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "No se pudieron cargar los movimientos";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateRange]);

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

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader
        title="Movimientos"
        subtitle="Resumen del negocio"
        showBack={false}
        showLogout={false}
        rightIcon={<Filter className="h-5 w-5 text-slate-600 hover:text-slate-900 transition-colors" />}
        onRightClick={() => setShowDropdown((d) => !d)}
      />

      <main className="mx-auto w-full max-w-4xl space-y-5 px-3 pb-28 pt-3 sm:px-4">
        {/* Menú Desplegable Flotante (Dropdown) */}
        <div className="relative">
          {showDropdown && (
            <>
              <button
                aria-label="Cerrar filtros"
                className="fixed inset-0 z-40"
                onClick={() => setShowDropdown(false)}
                type="button"
              />
              <div className="absolute right-0 z-50 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("month");
                    setShowDropdown(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50",
                    filterMode === "month"
                      ? "text-slate-900 font-semibold bg-slate-50"
                      : "text-slate-600 hover:text-slate-800"
                  )}
                >
                  Este mes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode("7days");
                    setShowDropdown(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50",
                    filterMode === "7days"
                      ? "text-slate-900 font-semibold bg-slate-50"
                      : "text-slate-600 hover:text-slate-800"
                  )}
                >
                  Últimos 7 días
                </button>
              </div>
            </>
          )}
        </div>

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

            {/* Calendario de filtrado diario de Movimientos */}
            {filterMode === "custom-day" ? (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-all duration-300">
                <DayPickerCalendar
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  markedDateKeys={new Set<string>()}
                  id="movements-calendar"
                />
                {!isSameCalendarDay(selectedDate, new Date()) && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date())}
                      className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 transition-all"
                    >
                      Hoy
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Renderiza un banner o badge plano ultra-limpio indicando el filtro activo */
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 flex justify-between items-center mb-6">
                <span>
                  Mostrando movimientos de: <strong>{filterMode === "month" ? "Este mes" : "Últimos 7 días"}</strong>
                </span>
                <button 
                  onClick={() => setFilterMode("custom-day")}
                  className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Volver al día individual
                </button>
              </div>
            )}

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
