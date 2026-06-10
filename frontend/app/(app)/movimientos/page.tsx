"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { MovementEmptyState } from "@/src/components/movements/MovementEmptyState";
import { MovementPeriodFilter } from "@/src/components/movements/MovementPeriodFilter";
import { MovementProfitHero } from "@/src/components/movements/MovementProfitHero";
import { MovementSummaryList } from "@/src/components/movements/MovementSummaryList";
import { periodRange } from "@/src/lib/movements/movementPeriod";
import { getAccountingSummary, type AccountingSummary } from "@/src/services/accounting";
import type { MovementPeriodKey } from "@/src/types/movements-ui";

export default function MovimientosPage() {
  const [period, setPeriod] = useState<MovementPeriodKey>("THIS_MONTH");
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setError(null);
        const range = periodRange(period);
        const data = await getAccountingSummary({
          from: range.from,
          to: range.to,
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
  }, [period]);

  const range = periodRange(period);
  
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
        rightIcon={<CalendarDays className="h-5 w-5 text-emerald-600" />}
        onRightClick={() => setShowPeriodPicker((p) => !p)}
      />

      <main className="mx-auto w-full max-w-4xl space-y-5 px-3 pb-28 pt-3 sm:px-4">
        {/* Selector de periodo desplegable desde el icono */}
        <div className="relative">
          {showPeriodPicker && (
            <>
              <button
                aria-label="Cerrar periodos"
                className="fixed inset-0 z-40"
                onClick={() => setShowPeriodPicker(false)}
                type="button"
              />
              <div className="absolute right-0 z-50 mt-2 w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg ring-1 ring-neutral-200">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  <span>Periodo: {range.label}</span>
                </div>
                <MovementPeriodFilter
                  value={period}
                  onChange={(v) => {
                    setPeriod(v);
                    setShowPeriodPicker(false);
                  }}
                />
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

        {!loading && !error && !hasData && <MovementEmptyState />}

        {!loading && !error && hasData && summary && (
          <>
            <MovementProfitHero metrics={summary} />

            <section className="space-y-5">
              <MovementSummaryList metrics={summary} />
            </section>
          </>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}
