"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNavbar from "@/src/components/layout/BottomNav";
import { MovementPeriodFilter } from "@/src/components/movements/MovementPeriodFilter";
import { MovementProfitHero } from "@/src/components/movements/MovementProfitHero";
import { MovementSummaryList } from "@/src/components/movements/MovementSummaryList";
import { MovementPercentBarChart } from "@/src/components/movements/MovementPercentBarChart";
import { MovementEmptyState } from "@/src/components/movements/MovementEmptyState";
import { mapMovementMetrics } from "@/src/lib/movements/mapMovementMetrics";
import { periodRange } from "@/src/lib/movements/movementPeriod";
import type { MovementPeriodKey } from "@/src/types/movements-ui";
import { listMovements, type BackendMovement } from "@/src/services/accounting";

export default function MovimientosPage() {
  const [period, setPeriod] = useState<MovementPeriodKey>("THIS_MONTH");
  const [rows, setRows] = useState<BackendMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setError(null);
        const range = periodRange(period);
        const data = await listMovements({
          from: range.from,
          to: range.to,
          onlyPosted: "false",
        });
        setRows(data ?? []);
      } catch (e: unknown) {
        console.error(e);
        setRows([]);
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
  const metrics = useMemo(() => mapMovementMetrics(rows, range.label), [rows, range.label]);
  const { view } = metrics;

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader
        title="Movimientos"
        subtitle="Resumen del negocio"
        showBack
        rightIcon={<CalendarDays className="h-5 w-5 text-emerald-600" />}
        onRightClick={() => setShowPeriodPicker((p) => !p)}
      />

      <main className="mx-auto w-full max-w-4xl px-3 pb-28 pt-3 space-y-5 sm:px-4">
        {/* Selector de período desplegable desde el ícono */}
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
                  <span>Período: {range.label}</span>
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

        {!loading && !error && !metrics.hasData && <MovementEmptyState />}

        {!loading && !error && metrics.hasData && (
          <>
            <MovementProfitHero amount={metrics.netProfit} />

            <MovementSummaryList metrics={view.summaryMetrics} />

            <MovementPercentBarChart
              items={view.chartData.map((c) => ({
                ...c,
                tone:
                  c.key === "netProfit"
                    ? "blue"
                    : c.key === "returns" || c.key === "costs" || c.key === "operatingExpenses" || c.key === "nonOperatingExpenses" || c.key === "taxProvision" || c.key === "legalReserve"
                      ? "red"
                      : "green",
              }))}
            />
          </>
        )}
      </main>

      <BottomNavbar active="movimientos" />
    </div>
  );
}
